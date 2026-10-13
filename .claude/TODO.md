# 🛑 停工快照（手写，非自动生成）

> 2026-09-28 收工 · 当前版本 **v1.0.220（已发版）**

**停在哪**：v1.0.220 全流程走完——开发 ✅ 单测 ✅ 真机验证 ✅ 独立对抗复审 ✅ 发版 ✅。
无半截活。详细交接见根目录 `handoff-v1.0.220.md`。

**下次开工第一件事**：**问祥哥另一台电脑装 220 的结果**——
① 装完能正常打开吗？② 还卡启动动画的话，要 `logs\startup.log`。

**从哪读起**：`handoff-v1.0.220.md`（本次全记录）→ `PROGRESS.md` 头部（v1.0.220 段）。

**红线提醒**：跑 Electron 一律带 `DATA_DIR=<沙箱>`；启动后先查日志的 `Window bounds:`
确认开的是沙箱再动手。对照实验写纯 Node 单元探针，**不许**起真 Electron 凑对照。

**环境迁移（2026-10-13）**：项目开始**两地接力开发**（家里 F 盘 ↔ 公司电脑）。
- 搬迁一律用 `git clone`（实测 6.35 MB / 186 文件），**不要拷文件夹** —— 原目录 14.2 GB 里
  12.5 GB 是 `dist-exe/` 堆积的 107 个历史安装包，已清理，只留 v1.0.220 全套。
- 本文件等接力笔记**已纳入 git**（commit `7ef2044`），换电脑 `git pull` 即可拿到；
  本机配置（`settings*.json` / `startup-status.json` / `local/`）仍不入库。
- **公司电脑落地三步**：① `npm install`（根 + server + client 三处）② `npm run build`
  ③ 配数据目录 —— 生产数据在本机 `G:\Users\Documents\晶振报价管理系统`，**不在仓库里**，需单独搬或重配 `dataDir`。
- **一处要改**：`.claude/settings.json` 的 hook 写死了 `C:/Users/Administrator/.claude/hooks/reminder-filter.sh`，
  公司电脑用户名不同就得改（其余配置无 `.env`，不丢东西）。
  > 补记：本机 `settings.json` 根本不在（`.claude/*` 默认不入库），这条只在家里那台适用。

---

## ✅ 公司电脑落地完成（2026-10-13 实测）· 详见 `docs/公司电脑接力开发-落地记录.md`

**上面第 ③ 条写错了，以这里为准**：本机生产数据**不在** `G:\...`（本机没有 G 盘），而是：

- **生产数据目录 = `D:\software\晶振报价管理系统`**（1101 文件 / 340.6 MB，祥哥**正在用**）
- 装机版 exe 也在 `D:\software\crystal-price-system\`，其 `%APPDATA%` 配置的 `dataDir` 指向上面这个目录
- **这台机器同时是开发机和一台在用生产机 → 开发调试绝不能碰那个目录**

**生产库基线指纹**（每次验证后核对）：`data.db` md5 = `9F76631CCDFA01203FFA3BF3673F33FC`，文件数 1101。
指纹文件在仓库外：`D:\dsh-workspace\晶振报价软件\dev-data\生产库基线指纹.txt`

**两个依赖坑（换电脑必复现，都已解决）**：
1. `better-sqlite3` —— 从 v1.0.13 起就没被 import 过的废弃依赖，却要编译 C++，导致 server 依赖**全部装不上**。
   已从 `server/package.json` 删除，删后 `npm install` 干净通过。
2. Electron 二进制**静默解压失败**（`install.js` 退出 0 但 `dist` 只有一个 LICENSE）。
   已从本机缓存 zip 手动解压 + 补 `path.txt` 解决，`electron --version` = v33.4.11。

**新的起法（一律走沙箱）**：
```powershell
.\scripts\dev-sandbox.ps1 server    # 后端
.\scripts\dev-sandbox.ps1 app       # 完整 Electron 真机验证
```
脚本强制 `DATA_DIR=..\dev-data`，并带护栏：指向生产目录会**拒绝启动**（已实测退出码 1）。

**本机两个环境坑**：① `.ps1` 必须存 **UTF-8 with BOM**，否则 PowerShell 5.1 按 GBK 读中文→语法错；
② 本机存在 `ELECTRON_RUN_AS_NODE=1`，会让 electron.exe 退化成 Node 不弹窗口（脚本已清）。

**验证结论**：依赖安装 ✅ / 构建 ✅ 26.77s / 后端测试 81 pass ✅ / 前端 3 pass ✅ /
沙箱后端 ✅ / 沙箱 Electron 真机启动 ✅ / **生产库 md5 与文件数均未变 ✅**。

**待办（本机若要发版才需要）**：本机没装 `gh` CLI，`scripts\release.ps1` 靠 `gh auth token`
建 Release —— 要在这台机器发版需先装 gh 并 `gh auth login`。

---

# 技术债务清单

> 自动追踪自 2026-08-17

- [ ] `F:\summer\vs-code\crystal-price-system\server\src\db.js:164` — status          TEXT DEFAULT 'todo',
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\index.js:328` — const r = execute(`UPDATE notes SET status = 'todo' WHERE status = 'in_progress' AND is_deleted = 0`)
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:404` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:180` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:219` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:394` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:181` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:220` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:178` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:217` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\client\src\views\NoteForm.vue:164` — const statusLabel = computed(() => ({ todo: '待办', done: '已完成', follow_up: '跟进后续' })[form.status] || '待办')
- [ ] `F:\summer\vs-code\crystal-price-system\client\src\views\NoteDetail.vue:51` — {{ {todo:'待办',done:'已完成',follow_up:'跟进后续'}[note.status] || '待办' }}
- [ ] `F:\summer\vs-code\crystal-price-system\client\src\views\NoteDetail.vue:78` — {{ {todo:'待办',done:'已完成',follow_up:'跟进后续'}[u.status] || '' }}
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:185` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:224` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:187` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:226` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:409` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:416` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:435` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:438` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:439` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:440` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:452` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:464` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:467` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:468` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:469` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:476` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:478` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
