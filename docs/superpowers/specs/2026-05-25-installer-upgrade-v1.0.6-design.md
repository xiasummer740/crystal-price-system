# 晶振报价管理系统 v1.0.6 安装包升级设计文档

- **日期**: 2026-05-25
- **版本**: v1.0.5 → v1.0.6
- **作者**: 祥哥 + Claude（Backend Architect）
- **状态**: 设计已审批，待生成实施计划

---

## 1. 背景与动机

祥哥在另一台电脑（D 盘安装）使用 v1.0.x 早期版本，今日上午录入并关闭应用后卸载、重装最新包，发现历史数据全部丢失。事后定位到 3 个根因：

1. **数据目录位于安装目录下**（`<exe dir>\晶振报价管理系统\`）。NSIS 卸载脚本 `RMDir /r` 会连数据一起删。
2. **卸载未弹"是否保留数据"确认框**。早期版本无此保护；当前版本 `installer.nsh` 中虽有 `MessageBox`，但 `IfSilent +3` 在卸载器被 × 关掉时仍走删除分支。
3. **保存机制存在静默失败路径**：`before-quit` 入口 `if (!dbSaveNow) return`，`db.js` 中 `saveNow()` 的 `if (db)` 守卫，两处都会无日志地跳过写盘；前端无任何"数据已保存"反馈，用户无法察觉。

本次升级目标：**让数据从此独立于安装目录、卸载前强制告警、保存状态前端可见、安装包体积可控**。

---

## 2. 总体目标

| 编号 | 目标 | 验收标准 |
|------|------|----------|
| G1 | 用户数据与安装目录解耦 | 卸载 / 重装后旧数据仍可读 |
| G2 | 保存可视化 | 任意写操作后 1 秒内顶栏出现"已保存 HH:mm:ss"提示 |
| G3 | 卸载二次确认 | 卸载默认保留数据；要彻底删除需勾选两次 |
| G4 | 安装包瘦身 | `dist-exe` 只保留当前版本产物 |

---

## 3. 模块设计

### 模块 1：数据目录管理（解耦 + 首次启动选择器 + 自动迁移）

#### 3.1 决策

- **首次启动行为**：弹原生目录选择器（`dialog.showOpenDialog`），默认值 `Documents\晶振报价管理系统\`，用户可改到任意位置。
- **配置持久化**：用户选择写入 `%APPDATA%\crystal-price-system\user-data-path.json`，结构：
  ```json
  { "dataDir": "C:\\Users\\admin\\Documents\\晶振报价管理系统", "version": 1, "setAt": "2026-05-25T10:00:00Z" }
  ```
  此文件**不**随软件卸载删除（位于 AppData/Roaming，NSIS 不触碰）。
- **数据来源优先级**：
  1. `%APPDATA%\crystal-price-system\user-data-path.json` 指向的目录（如存在）
  2. 自动迁移：旧版固定位置（按顺序探测）
     - `<exe dir>\晶振报价管理系统\`（v1.0.5 默认）
     - `<Documents>\晶振报价管理系统\`
     - `<userData>\data\`
     - `%LOCALAPPDATA%\crystal-price-system\data\`
  3. 都没有 → 弹选择器让用户决定。
- **迁移策略**：检测到旧数据时，**复制**（不剪切）到新位置，并在旧位置写 `MIGRATED.txt` 标记，避免重复迁移。

#### 3.2 影响文件

- `electron/main.js`：替换 lines 65-105 的数据目录解析逻辑，新增 `resolveDataDir()` 函数。
- 新增 `electron/config.js`：封装 `loadUserConfig()` / `saveUserConfig()`。

#### 3.3 关键代码骨架

```js
// electron/config.js
const CONFIG_DIR = path.join(app.getPath('appData'), 'crystal-price-system')
const CONFIG_FILE = path.join(CONFIG_DIR, 'user-data-path.json')

export function loadUserConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) } catch { return null }
}
export function saveUserConfig(dataDir) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ dataDir, version: 1, setAt: new Date().toISOString() }, null, 2))
}
```

```js
// electron/main.js（节选）
async function resolveDataDir() {
  const cfg = loadUserConfig()
  if (cfg?.dataDir && fs.existsSync(cfg.dataDir)) return cfg.dataDir

  const legacyDirs = [
    path.join(path.dirname(app.getPath('exe')), '晶振报价管理系统'),
    path.join(app.getPath('documents'), '晶振报价管理系统'),
    path.join(app.getPath('userData'), 'data'),
    path.join(process.env.LOCALAPPDATA || '', 'crystal-price-system', 'data')
  ]
  const found = legacyDirs.find(d => fs.existsSync(path.join(d, '数据库', 'data.db')) || fs.existsSync(path.join(d, 'data.db')))

  if (found) {
    const target = path.join(app.getPath('documents'), '晶振报价管理系统')
    if (found !== target) await migrateDir(found, target)
    saveUserConfig(target)
    return target
  }

  // 全新用户：弹选择器
  const def = path.join(app.getPath('documents'), '晶振报价管理系统')
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '请选择数据保存位置',
    defaultPath: def,
    properties: ['openDirectory', 'createDirectory']
  })
  const chosen = canceled ? def : filePaths[0]
  saveUserConfig(chosen)
  return chosen
}
```

---

### 模块 2：实时保存状态 UI

#### 2.1 决策

- **位置**：`Dashboard.vue` 工具栏，📒 报价计算器按钮右侧（祥哥指定）。
- **样式**：单行小标签，三态：
  - `saved`（绿点）：`已保存 HH:mm:ss`
  - `saving`（黄点 + 旋转）：`保存中…`
  - `failed`（红点）：`保存失败 ⚠ 点击重试`
- **数据源**：Pinia store `useSaveStatusStore`，全局 axios 响应拦截器更新。
- **触发时机**：任意 `POST/PUT/DELETE` 请求成功 → `setSaved(now)`；请求中 → `setSaving()`；失败 → `setFailed(err)`。

#### 2.2 服务端配套

- `server/src/db.js::saveNow()` 当前 `if (db)` 守卫静默返回 → 改为：未初始化时抛出 `Error('DB not ready')`，由路由层捕获返回 500，前端拦截器自然显示失败。
- `electron/main.js::before-quit` 中 `if (!dbSaveNow) return` → 改为：尝试 `require('../server/src/db.js')` 兜底加载，仍失败则写 `log()` 并 `dialog.showErrorBox` 提示。

#### 2.3 影响文件

- 新增 `client/src/stores/saveStatus.js`：Pinia store。
- 新增 `client/src/components/SaveStatusBadge.vue`：UI 组件。
- 修改 `client/src/views/Dashboard.vue`：line 29 后插入 `<SaveStatusBadge />`。
- 修改 `client/src/utils/request.js`（或 axios 实例所在文件）：注入拦截器。
- 修改 `server/src/db.js`：移除静默守卫。
- 修改 `electron/main.js`：`before-quit` 兜底。

---

### 模块 3：NSIS 卸载弹窗加固 + 卸载后开数据夹

#### 3.1 决策

- **默认行为**：保留数据。
- **弹窗按钮**：`MB_YESNO | MB_DEFBUTTON2 | MB_ICONQUESTION`，"否"为默认，文案：
  > 是否同时永久删除所有报价数据？
  > 　
  > 选"否"将保留数据目录，下次安装可继续使用（推荐）。
  > 选"是"将永久删除所有数据（不可恢复！）。
- **静默卸载兜底**：`/SD IDNO`（静默时默认 = 否，绝不误删）。
- **二次确认**：若用户选"是"，再弹一个 `MB_YESNO | MB_DEFBUTTON2 | MB_ICONEXCLAMATION`：
  > 确认要删除所有数据吗？此操作不可撤销！
- **卸载后开夹**：无论是否删除，卸载完成都尝试 `ExecShell "open" "$DataDir"`。删除分支则跳过（目录不存在）。
- **数据目录定位**：NSIS 读 `$APPDATA\crystal-price-system\user-data-path.json` 的 `dataDir` 字段（用 `nsJSON` 插件，或自己写简易解析）。读不到则按旧顺序探测。

#### 3.2 影响文件

- `build/installer.nsh`：重写 `customUnInstall` 宏。
- `electron-builder.yml`：确认 `nsis.include: build/installer.nsh`。
- 可选：`build/nsJSON.nsh` 插件（如祥哥同意引入；否则手写 JSON 解析）。

#### 3.3 关键代码骨架（NSIS）

```nsis
!macro customUnInstall
  ; 1. 读取数据目录
  Var /GLOBAL DataDir
  ; 优先读 APPDATA 配置
  ${If} ${FileExists} "$APPDATA\crystal-price-system\user-data-path.json"
    ; 简易解析 "dataDir":"..." 中的值
    ${ConfigRead} "$APPDATA\crystal-price-system\user-data-path.json" '"dataDir":"' $DataDir
  ${EndIf}
  ${If} $DataDir == ""
    StrCpy $DataDir "$INSTDIR\晶振报价管理系统"
  ${EndIf}

  ; 2. 首问
  MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION \
    "是否同时永久删除所有报价数据？$\n$\n选「否」将保留数据目录，下次安装可继续使用（推荐）。$\n选「是」将永久删除所有数据（不可恢复！）。" \
    /SD IDNO IDYES confirmDelete IDNO keepData

  confirmDelete:
    ; 3. 二次确认
    MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONEXCLAMATION \
      "确认要删除所有数据吗？此操作不可撤销！" \
      /SD IDNO IDYES doDelete IDNO keepData
  doDelete:
    RMDir /r "$DataDir"
    ; 同时清掉配置（让下次安装当新用户处理）
    Delete "$APPDATA\crystal-price-system\user-data-path.json"
    Goto done
  keepData:
    ; 自动打开数据夹方便祥哥检查
    ExecShell "open" "$DataDir"
  done:
!macroend
```

> 备注：上面 `${ConfigRead}` 是占位，实际用 `nsJSON` 或自写 `FileRead` + 字符串截取实现。

---

### 模块 4：dist-exe 清理 + 防累积

#### 4.1 决策

- **本次手动清理**：删除 `dist-exe` 下所有旧产物，只保留即将生成的 v1.0.6 安装包与便携包。具体目标：
  - `*1.0.4*`、`*1.0.5*` 全部删
  - `win-unpacked/`、`builder-debug.yml`、`.icon-ico`、`晶振报价管理系统/` 中间目录全部删
- **未来防累积**：`electron-builder.yml` 增加 `beforePack` hook，每次打包前清空 `dist-exe`。
  ```yaml
  beforePack: "scripts/clean-dist.js"
  ```
- 新增 `scripts/clean-dist.js`：删除 `dist-exe` 下除最新一个 portable + 一个 nsis 之外的所有文件。

#### 4.2 影响文件

- 新增 `scripts/clean-dist.js`。
- 修改 `electron-builder.yml`：加 `beforePack`。
- 修改 `package.json::version`: `1.0.5` → `1.0.6`。

---

## 4. 数据流总览

```
首次启动
  └─ resolveDataDir()
       ├─ 读 user-data-path.json     ─→ 有 → 直接用
       ├─ 探测 4 个 legacy 路径       ─→ 找到 → 迁移到 Documents → 写 config
       └─ 弹 dialog.showOpenDialog   ─→ 用户确认 → 写 config

每次写操作
  Vue → axios.POST
    └─ 拦截器 setSaving()
       └─ Express 路由 → db.execute() → db.saveNow() 同步落盘
          └─ 响应 200 → 拦截器 setSaved(now) → 顶栏徽章更新

退出
  before-quit
    └─ saveNow() (兜底) → 备份数据库 → 导出 Excel → quit

卸载
  customUnInstall
    └─ 读 config 拿 dataDir
       ├─ 默认保留 → ExecShell open
       └─ 二次确认删 → RMDir /r + 删 config
```

---

## 5. 版本与发布

| 项 | 值 |
|----|----|
| `package.json` version | `1.0.6` |
| `client/package.json` version | `1.0.6` |
| installer 文件名 | `晶振报价管理系统-Setup-1.0.6.exe` |
| portable 文件名 | `晶振报价管理系统-1.0.6.exe` |
| 旧产物处理 | 全删，dist-exe 干净起步 |

---

## 6. 风险点

| 编号 | 风险 | 缓解 |
|------|------|------|
| R1 | 旧用户首次升级时数据目录在 `D:\software\crystal-price-system\晶振报价管理系统\`，迁移到 Documents 会跨盘复制大文件 | 仅复制不删除；提示用户"已迁移到 X，旧位置仍保留" |
| R2 | 用户卸载时 NSIS 进程无权读 `$APPDATA\<user>\crystal-price-system\`（每机器安装 + 不同用户）| `perMachine: false`，安装 / 卸载都在当前用户上下文，APPDATA 一致 |
| R3 | sql.js 在并发写场景下 `db.export()` 期间被新请求修改内存 | 现有架构是单线程 Node，无真并发；保持现状 |
| R4 | `before-quit` 期间 saveNow 失败但 quit 已注册 | 改为 `event.preventDefault()` + 显示错误 dialog + 再 quit |
| R5 | 用户选了一个权限不足的目录（如 `C:\Program Files`）| 启动时尝试写测试文件，失败则重弹选择器 |

---

## 7. 暂不做（明确范围外）

- 云同步 / 多端同步
- 数据加密
- 用户登录鉴权（保留现有简易 token）
- sql.js → better-sqlite3 迁移（受 Electron 原生模块编译复杂度限制，暂不动）
- 多数据库 / 多账套
- 自动更新（OTA）

---

## 8. 验收清单

- [ ] 全新机器安装 v1.0.6 → 首次启动弹目录选择器，默认 Documents
- [ ] 从 v1.0.5 升级 → 自动迁移旧数据到 Documents，应用正常打开看到全部记录
- [ ] 录入一条新报价 → 顶栏 1 秒内显示 "已保存 HH:mm:ss"
- [ ] 断网 / 杀掉 server 进程后录入 → 顶栏显示 "保存失败"，点击可重试
- [ ] 卸载时不点任何按钮直接 × → 默认保留数据
- [ ] 卸载时选"是" → 弹二次确认 → 选"否" → 仍保留
- [ ] 卸载时连续两次选"是" → 数据被删 + config 被删
- [ ] 卸载保留分支完成后 → Explorer 自动打开数据目录
- [ ] 重新打包 → dist-exe 中只有 v1.0.6 两个 exe
