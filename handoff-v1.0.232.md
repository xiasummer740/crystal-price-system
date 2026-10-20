# 接力文档 v1.0.232

> 起因：2026-10-20 早上祥哥打开软件，闪屏显示「启动较慢（已 67 秒）」，最后启动总耗时 **141 秒**。
> 查日志和机器状态后确认：服务端 6.6 秒就好了，剩下 130 多秒是 2 核赛扬被
> 火绒（HipsDaemon 65%）+ GameViewerServer（59%）+ 微信小程序（37%）占满 CPU，渲染进程抢不到算力。
> 祥哥要求做三件事（本版只做这三件）：
> ① 把「每日数据库备份 + 规格书清理」挪出启动阻塞路径；
> ② 闪屏兜底 90 秒 → 45 秒，并加「直接进入（跳过动画）」按钮；
> ③ 做启动阶段耗时诊断，每次写进 app 日志。

## 一句话

服务模块加载从 **6.6 秒降到 ~2.0 秒**（备份写盘和规格书扫描挪到窗口显示后）；
闪屏 45 秒兜底 + 一键「直接进入」；每次启动多两行 `[startup]` 摘要（+ `logs/startup-phases.jsonl`），
以后「为什么慢」直接看日志点名到阶段。

## 一、延后维护（每日备份 + 规格书清理）

| 以前（启动阻塞） | 现在 |
|---|---|
| `initDb()` 里 `copyFileSync` 897KB 备份（慢机器 3~4 秒） | 只**记住读盘那一刻的字节**，写盘延后 |
| 服务 import 完立刻 walk 整个规格书目录去重 | 主窗口显示后再扫 |

- 开关：Electron 主进程在 import 服务模块前设 `DEFER_STARTUP_BACKUP=1` / `DEFER_STARTUP_MAINTENANCE=1`；
  直接 `node server/src/index.js`（开发/测试）不设这两个变量 ⇒ 行为与以前完全一样，测试不受影响。
- 触发：`ready-to-show` / `did-finish-load` **谁先到算谁**，各延 1.2 秒；再加一条
  「建窗后 15 秒兜底」——页面永远载不进来（就像 10-20 那次）时，备份也不能丢。
- 服务端入口：`runDeferredMaintenance()`（幂等），内部调 `flushDeferredDailyDbBackup()` + `cleanupDuplicateSpecs()`。

⚠️ **必须复制字节，且要在交给 sql.js 之前 capture**：
sql.js `new SQL.Database(buffer)` 之后会执行 `PRAGMA journal_mode=WAL`，内存里的页头会从
`01 01` 变成 `02 02`；直接存原 Buffer 引用，延后写到磁盘的就是「改过之后」的库。
`tests/db-deferred-backup.test.js` 用「备份逐字节等于启动时文件」把这条钉住了（实测第一版就踩了这个坑）。

## 二、闪屏 45 秒 + 「直接进入（跳过动画）」

- `SPLASH_TIMEOUT_MS` 90s → **45s**。为什么不是更低：历史冷启动基线 26.6s，45s 还有 1.7 倍余量；
  而且现在有跳过按钮，到点就把窗口亮出来。
- 按钮：闪屏卡片底部，2 秒后淡入（热启动 1 秒就完了，不会闪一下）。
  点击路径：按钮 → `electron/splash-preload.cjs` 的 `contextBridge` → `ipcMain 'splash:skip'`
  → 立即 `mainWindow.show()` + 收闪屏（主进程被同步 import 堵住时，IPC 会排队等它空下来）。
- 未建窗时点了也认：记 `_splashSkipRequested`，`createWindow` 后立刻兑现。
- 闪屏文案的「较慢」阈值也从 30 秒提前到 20 秒，并提示可以点「直接进入」。

## 三、启动阶段诊断

每次启动在 `logs/startup.log` 打两行：

```
[startup] 页面加载完成 | 总计 33.3s | Electron初始化 2.5s | 数据目录 416ms | 服务模块 2.0s | 监听 7ms | 建窗 406ms | 首屏 28.0s | 闪屏关闭于 12.3s
[startup] 服务内部 {"deferred_maintenance":true,"db_init_ms":149,...,"archive_sync_ms":471,"template_write_ms":26,"deferred_maintenance_ms":3}
```

- 同时追加一行 JSON 到 `logs/startup-phases.jsonl`（version / 总耗时 / 各段 / 服务内部），方便前后对比。
- 最慢的一段 ≥5 秒会单独点名：`[startup] ⚠️ 最慢一段：first_page 28.0s`。
- 兜底/加载失败也会打摘要（`complete:false`），不会因为没载入就没有诊断。

## 四、验证

- 后端 **177 pass**（新增 `tests/db-deferred-backup.test.js` 4 条：延后不写盘、flush 内容=读盘字节、
  幂等、只留一份）。
- 沙箱真机（Electron + `DATA_DIR=D:\temp\suggest-verify\data`，CDP 连进去）：
  - 服务模块 **2.0~2.2s**（改前同一路径 6.6s）；`db_init_ms` 96~175ms、`archive_sync_ms` 427~617ms、
    `template_write_ms` 26~141ms、`module_total_ms` 724~847ms。
  - 延后维护：窗口就绪/15 秒兜底后执行，`daily_backup_ms` 232ms（首次当天）/0ms（已备过）、
    `spec_cleanup_ms` 3ms；备份文件 `备份/数据库日备/data-2026-10-20.db` 正常生成。
  - 「直接进入」：CDP 读到按钮文案 `直接进入（跳过动画）`；点击后日志出现
    `用户点击「直接进入（跳过动画）」` + `关闭闪屏（用户跳过动画）`，闪屏 target 消失，
    主窗口 `document.visibilityState === 'visible'`（页面后续继续加载）。
  - 45 秒兜底：用 CDP `Debugger.pause` 把渲染进程冻住 → **45 秒整**打出
    `⚠️ 闪屏兜底超时：主窗口 45000ms 内未就绪`，摘要里「首屏 —」。
  - 截图：`splash-skip-button.png`（闪屏上的按钮）。
- 打包版（win-unpacked/asar，CDP 9226）**全过**：
  - `PRELOAD_API true`（asar 内 `electron/splash-preload.cjs` 正常加载）
  - 按钮文案正确；点击后闪屏 5.4 秒内收掉、主窗口 `visibilityState=visible`
  - 日志有「用户点击…」「关闭闪屏（用户跳过动画）」「[startup] 服务内部」「延后维护已执行」
  - 当天备份 `data-2026-10-20.db`（901120 B）在延后维护里生成（`daily_backup_ms 288`）
  - 摘要：总计 47.3s | 服务模块 4.1s | 建窗 457ms | 首屏 38.0s（机器当时仍被 GameViewer/火绒占满）
  - 观察到打包版 `template_write_ms` 达 2162ms（3 个模板 xlsx 每次启动重写）——也在阻塞路径里，
    但不在本次三项范围内，先记着；下次可一起挪到延后维护。

## 五、遗留 / 下次

- `syncArchive()`（客户资料归档迁移）**仍在启动阻塞路径**：本机 0.4~0.6 秒、且涉及文件搬迁，
  没有一起挪（挪了会和用户上传抢文件）。若以后它在别的机器上很慢，再单独评估。
- 延后维护的窗口期：如果用户在主窗口出来后 1~2 秒内就退出，当天备份可能没写成；
  但次日启动会补（备份按日期、只差一天）。可接受。
- 外部问题（不是软件能修的）：`GameViewerService`（`D:\software\GameViewer\GameViewerService.exe`，
  开机自启）实测单进程吃 **59~81% CPU**，建议停掉/改手动；火绒把
  `D:\software\crystal-price-system` 和 `D:\software\晶振报价管理系统` 加信任区。
