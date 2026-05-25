# 晶振报价管理系统 v1.0.6 安装包升级 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 v1.0.6 升级：数据目录与安装目录解耦 + 前端保存状态可视化 + NSIS 卸载二次确认 + 安装包瘦身。

**Architecture:** Electron 33 主进程接管数据目录解析与持久化配置；Vue 3 前端通过 Pinia + Axios 拦截器实现保存徽章；NSIS `customUnInstall` 重写以读取 APPDATA 配置并加固删除流程；electron-builder 增加 `beforePack` 钩子持续清理 `dist-exe`。

**Tech Stack:** Electron 33, sql.js, Express, Vue 3 + Pinia + Vant + Axios, electron-builder + NSIS, Node 18+ (ESM)

**Spec：** `docs/superpowers/specs/2026-05-25-installer-upgrade-v1.0.6-design.md`

> **注意：** 本项目非 git 仓库。计划中的"提交"步骤不执行 `git commit`，改为在任务结尾运行验证命令并人工确认效果，再进入下一任务。

---

## 文件结构

### 新增文件
| 路径 | 职责 |
|------|------|
| `electron/config.js` | 用户配置（`%APPDATA%\crystal-price-system\user-data-path.json`）的读写封装 |
| `client/src/stores/saveStatus.js` | Pinia store：维护 `state ∈ {idle, saving, saved, failed}` 与 `lastSavedAt`、`errorMsg` |
| `client/src/components/SaveStatusBadge.vue` | 顶部工具栏徽章 UI（三态：已保存/保存中/失败） |
| `scripts/clean-dist.js` | electron-builder `beforePack` 钩子：清空 `dist-exe` |
| `docs/superpowers/plans/2026-05-25-installer-upgrade-v1.0.6.md` | 本文件 |

### 修改文件
| 路径 | 改动范围 |
|------|----------|
| `package.json` | `version: 1.0.5 → 1.0.6` |
| `client/package.json` | `version` 同步到 `1.0.6` |
| `electron/main.js` | 替换 lines 65-105（旧数据目录解析）；改 line 292 `before-quit` 守卫；引入 `electron/config.js` |
| `server/src/db.js` | line 168-173 `saveNow()` 移除静默 `if (db)` 守卫，改抛错 |
| `client/src/utils/api.js` | 在现有 `http.interceptors` 上挂保存状态钩子 |
| `client/src/views/Dashboard.vue` | line 29 之后插入 `<SaveStatusBadge />`，import 组件 |
| `build/installer.nsh` | 重写 `customUnInstall`（含 JSON 解析、二次确认、ExecShell） |
| `electron-builder.yml` | 新增 `beforePack: scripts/clean-dist.js`（顶层字段） |

### 删除文件（手动清理 dist-exe）
- `dist-exe/晶振报价管理系统-便携版-v1.0.4.exe`
- `dist-exe/晶振报价管理系统-安装版-v1.0.4.exe`
- `dist-exe/晶振报价管理系统-安装版-v1.0.4.exe.blockmap`
- `dist-exe/晶振报价管理系统-便携版-v1.0.5.exe`
- `dist-exe/晶振报价管理系统-安装版-v1.0.5.exe`
- `dist-exe/晶振报价管理系统-安装版-v1.0.5.exe.blockmap`
- `dist-exe/builder-debug.yml`

---

## Task 1：版本号 Bump + dist-exe 手动清理

**Files:**
- Modify: `package.json:2`
- Modify: `client/package.json`（搜索 `"version"` 字段）
- Delete: 上文列出的 7 个 `dist-exe/*` 文件

- [ ] **Step 1：bump 根 package.json 版本**

修改 `F:\summer\vs code\crystal-price-system\package.json` 第 3 行：

```diff
-  "version": "1.0.5",
+  "version": "1.0.6",
```

- [ ] **Step 2：bump client/package.json 版本**

打开 `F:\summer\vs code\crystal-price-system\client\package.json`，把 `"version"` 字段改为 `"1.0.6"`（先 Read 确认当前值）。

- [ ] **Step 3：删除 dist-exe 旧产物**

执行（PowerShell）：

```powershell
Remove-Item "F:\summer\vs code\crystal-price-system\dist-exe\晶振报价管理系统-便携版-v1.0.4.exe" -Force
Remove-Item "F:\summer\vs code\crystal-price-system\dist-exe\晶振报价管理系统-安装版-v1.0.4.exe" -Force
Remove-Item "F:\summer\vs code\crystal-price-system\dist-exe\晶振报价管理系统-安装版-v1.0.4.exe.blockmap" -Force
Remove-Item "F:\summer\vs code\crystal-price-system\dist-exe\晶振报价管理系统-便携版-v1.0.5.exe" -Force
Remove-Item "F:\summer\vs code\crystal-price-system\dist-exe\晶振报价管理系统-安装版-v1.0.5.exe" -Force
Remove-Item "F:\summer\vs code\crystal-price-system\dist-exe\晶振报价管理系统-安装版-v1.0.5.exe.blockmap" -Force
Remove-Item "F:\summer\vs code\crystal-price-system\dist-exe\builder-debug.yml" -Force
```

- [ ] **Step 4：确认目录已干净**

执行 `Get-ChildItem "F:\summer\vs code\crystal-price-system\dist-exe"`，期望输出：空或仅剩 `win-unpacked\`（中间目录可保留，下次打包会被 `beforePack` 清掉）。

- [ ] **Step 5：标记完成**

`TaskUpdate` 标 Task 1 为 completed。

---

## Task 2：scripts/clean-dist.js（防累积钩子）

**Files:**
- Create: `scripts/clean-dist.js`
- Modify: `electron-builder.yml`（顶层新增 `beforePack` 字段）

- [ ] **Step 1：创建 scripts 目录与脚本**

写入 `F:\summer\vs code\crystal-price-system\scripts\clean-dist.js`：

```js
// electron-builder beforePack hook: 清空 dist-exe，避免历史产物累积
import fs from 'fs'
import path from 'path'

export default async function (context) {
  const outDir = path.join(context.outDir || path.resolve('dist-exe'))
  if (!fs.existsSync(outDir)) return
  for (const entry of fs.readdirSync(outDir)) {
    const p = path.join(outDir, entry)
    try {
      if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true })
      else fs.unlinkSync(p)
    } catch (e) {
      console.warn('[clean-dist] 删除失败：', p, e.message)
    }
  }
  console.log('[clean-dist] dist-exe 已清空')
}
```

- [ ] **Step 2：electron-builder.yml 注册钩子**

在 `F:\summer\vs code\crystal-price-system\electron-builder.yml` 第 4 行（`directories:` 行）**之前**新增一行：

```yaml
beforePack: "scripts/clean-dist.js"
```

修改后文件顶部应为：

```yaml
appId: com.crystal.price-system
productName: 晶振报价管理系统
beforePack: "scripts/clean-dist.js"
directories:
  output: dist-exe
```

- [ ] **Step 3：干跑验证（不真打包）**

执行 `node -e "import('./scripts/clean-dist.js').then(m => m.default({ outDir: './dist-exe' }))"`，期望输出 `[clean-dist] dist-exe 已清空`，并且 `dist-exe` 目录中残留全部清掉。

- [ ] **Step 4：标记完成**

---

## Task 3：electron/config.js（用户配置读写）

**Files:**
- Create: `electron/config.js`

- [ ] **Step 1：写入文件**

写入 `F:\summer\vs code\crystal-price-system\electron\config.js`：

```js
// 用户配置：数据目录路径
// 位置：%APPDATA%\crystal-price-system\user-data-path.json
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const CONFIG_DIR = path.join(app.getPath('appData'), 'crystal-price-system')
const CONFIG_FILE = path.join(CONFIG_DIR, 'user-data-path.json')

export function loadUserConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return null
  }
}

export function saveUserConfig(dataDir) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const payload = {
    dataDir,
    version: 1,
    setAt: new Date().toISOString()
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8')
}

export function getConfigFilePath() {
  return CONFIG_FILE
}
```

- [ ] **Step 2：人工冒烟验证**

在 Node REPL（项目根）执行：

```powershell
node --input-type=module -e "import('electron').then(({app}) => { app.whenReady().then(async () => { const m = await import('./electron/config.js'); m.saveUserConfig('C:\\TEST'); console.log(m.loadUserConfig()); app.quit() }) })"
```

期望：打印 `{ dataDir: 'C:\\TEST', version: 1, setAt: '...' }`，并在 `%APPDATA%\crystal-price-system\user-data-path.json` 产生文件。

> 若 PowerShell 中 electron 不能直接以脚本启动，可跳过此 step，留待 Task 4 集成测试时一并验证。

- [ ] **Step 3：清理测试残留**

```powershell
Remove-Item "$env:APPDATA\crystal-price-system\user-data-path.json" -Force -ErrorAction SilentlyContinue
```

- [ ] **Step 4：标记完成**

---

## Task 4：electron/main.js 数据目录重构

**Files:**
- Modify: `electron/main.js`（替换 lines 63-114 的 `startServer()` 前半段，新增 import）

- [ ] **Step 1：在文件顶部新增 import（在第 6 行 `fileURLToPath` import 之后）**

```diff
 import { app, BrowserWindow, shell, dialog, Menu } from 'electron'
 import path from 'path'
 import fs from 'fs'
 import { execSync } from 'child_process'
 import { fileURLToPath } from 'url'
+import { loadUserConfig, saveUserConfig } from './config.js'
```

- [ ] **Step 2：在 `freePort` 函数之后、`startServer` 之前，新增工具函数**

在 `electron/main.js` 第 28 行（freePort 函数结束 `}`）之后插入：

```js
// 复制目录（递归，跳过已存在的文件）
function copyDirRecursive(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const sp = path.join(src, entry)
    const dp = path.join(dst, entry)
    const stat = fs.statSync(sp)
    if (stat.isDirectory()) {
      copyDirRecursive(sp, dp)
    } else if (!fs.existsSync(dp)) {
      fs.copyFileSync(sp, dp)
    }
  }
}

// 检测路径下是否存在有效的数据库文件
function hasDb(dir) {
  return fs.existsSync(path.join(dir, '数据库', 'data.db')) ||
         fs.existsSync(path.join(dir, 'data.db'))
}

// 解析数据目录：优先配置 → 自动迁移 legacy → 弹选择器
async function resolveDataDir() {
  // 1. 读已保存的用户配置
  const cfg = loadUserConfig()
  if (cfg?.dataDir && fs.existsSync(cfg.dataDir)) {
    log(`resolveDataDir: 使用配置目录 ${cfg.dataDir}`)
    return cfg.dataDir
  }

  // 2. 探测 legacy 路径
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'))
  const legacyDirs = [
    path.join(exeDir, '晶振报价管理系统'),
    path.join(app.getPath('documents'), '晶振报价管理系统'),
    path.join(app.getPath('userData'), 'data'),
    path.join(process.env.LOCALAPPDATA || '', 'crystal-price-system', 'data')
  ]
  const found = legacyDirs.find(d => fs.existsSync(d) && hasDb(d))

  if (found) {
    const target = path.join(app.getPath('documents'), '晶振报价管理系统')
    if (found !== target) {
      log(`resolveDataDir: 迁移 ${found} → ${target}`)
      try {
        copyDirRecursive(found, target)
        // 在旧位置写迁移标记
        fs.writeFileSync(
          path.join(found, 'MIGRATED.txt'),
          `已于 ${new Date().toISOString()} 迁移到 ${target}\n（此目录可安全删除）`,
          'utf8'
        )
      } catch (e) {
        log(`迁移失败：${e.message}，仍使用原位置`)
        saveUserConfig(found)
        return found
      }
    }
    saveUserConfig(target)
    return target
  }

  // 3. 弹选择器
  const def = path.join(app.getPath('documents'), '晶振报价管理系统')
  log('resolveDataDir: 全新用户，弹选择器')
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '请选择数据保存位置',
    message: '请选择晶振报价管理系统的数据保存位置（建议放在文档目录）',
    defaultPath: def,
    properties: ['openDirectory', 'createDirectory']
  })
  const chosen = (canceled || !filePaths?.[0]) ? def : filePaths[0]
  if (!fs.existsSync(chosen)) fs.mkdirSync(chosen, { recursive: true })

  // 写权限测试
  try {
    const probe = path.join(chosen, '.write-test')
    fs.writeFileSync(probe, '')
    fs.unlinkSync(probe)
  } catch (e) {
    log(`目录无写权限：${chosen}`)
    dialog.showErrorBox('权限不足', `选定的目录 ${chosen} 无写入权限，将回退到默认位置：${def}`)
    if (!fs.existsSync(def)) fs.mkdirSync(def, { recursive: true })
    saveUserConfig(def)
    return def
  }

  saveUserConfig(chosen)
  return chosen
}
```

- [ ] **Step 3：替换 `startServer()` 函数的数据目录解析段**

将 `electron/main.js` 中 `async function startServer() {` 内部从 `// 数据库位置...` 到 `for (const sd of subdirs) { ... }` 整段（原 lines 64-112）替换为：

```js
async function startServer() {
  // 数据目录：用户配置 → legacy 探测+迁移 → 弹选择器
  const dataDir = await resolveDataDir()
  log(`dataDir: ${dataDir}`)
  const subdirs = ['数据库', '规格书', '模板', '备份', 'Excel备份']
  for (const sd of subdirs) {
    const p = path.join(dataDir, sd)
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  }
  process.env.DATA_DIR = dataDir
  log(`DATA_DIR: ${dataDir}`)
```

替换后 `startServer()` 后半段（`log('Starting server import...')` 之后）保持不变。

- [ ] **Step 4：加固 `before-quit` 兜底**

将原 line 292-323 的 `app.on('before-quit', ...)` 整段替换为：

```js
// 关闭前保存数据库 + 自动备份（数据库 + Excel）
app.on('before-quit', () => {
  try {
    if (!dbSaveNow) {
      log('before-quit: dbSaveNow 未初始化（启动失败？），跳过保存')
      return
    }
    dbSaveNow()
    const dataDir = process.env.DATA_DIR
    if (!dataDir) { log('before-quit: DATA_DIR 未设置，跳过备份'); return }

    // 数据库备份（保留30份）
    const dbBackupDir = path.join(dataDir, '备份')
    if (!fs.existsSync(dbBackupDir)) fs.mkdirSync(dbBackupDir, { recursive: true })
    const dbPath = path.join(dataDir, '数据库', 'data.db')
    if (fs.existsSync(dbPath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      fs.copyFileSync(dbPath, path.join(dbBackupDir, `data-backup-${ts}.db`))
      const files = fs.readdirSync(dbBackupDir).filter(f => f.endsWith('.db')).sort()
      while (files.length > 30) { fs.unlinkSync(path.join(dbBackupDir, files.shift())) }
    }
    // Excel 备份（报价+样品各保留10份）
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const excelDir = path.join(dataDir, 'Excel备份')
    if (!fs.existsSync(excelDir)) fs.mkdirSync(excelDir, { recursive: true })
    if (doExportToExcel) {
      try { const buf = doExportToExcel({}); fs.writeFileSync(path.join(excelDir, '报价记录-' + ts + '.xlsx'), buf) } catch(e) { log('Excel backup error: ' + e.message) }
      const pf = fs.readdirSync(excelDir).filter(f => f.startsWith('报价记录')).sort()
      while (pf.length > 10) { fs.unlinkSync(path.join(excelDir, pf.shift())) }
    }
    if (doExportSamples) {
      try { const buf = doExportSamples({}); fs.writeFileSync(path.join(excelDir, '样品登记-' + ts + '.xlsx'), buf) } catch(e) { log('Samples backup error: ' + e.message) }
      const sf = fs.readdirSync(excelDir).filter(f => f.startsWith('样品登记')).sort()
      while (sf.length > 10) { fs.unlinkSync(path.join(excelDir, sf.shift())) }
    }
    log('before-quit: 保存 + 备份完成')
  } catch (e) {
    log('before-quit error: ' + (e.stack || e.message))
  }
})
```

> **关键说明：** main.js 是 ESM，`before-quit` 是同步事件不支持 `await import()`；因此 dbSaveNow 未初始化时无法运行时加载。直接 `log()` + return 是最安全的策略——`dbSaveNow` 在 `startServer()` 末尾已赋值，正常路径必有值；只有当 `startServer()` 抛错时才为 undefined，此时也没有可保存的数据。

- [ ] **Step 5：开发模式启动验证**

```powershell
cd "F:\summer\vs code\crystal-price-system"
npm run dev
```

期望：
- 首次启动 → 弹目录选择器（默认 `Documents\晶振报价管理系统`）
- 取消选择 → 仍使用默认路径
- 选择后 → `%APPDATA%\crystal-price-system\user-data-path.json` 出现
- 关闭应用 → `Documents\startup.log` 末尾出现 `before-quit: 保存 + 备份完成`

- [ ] **Step 6：清理测试残留**

```powershell
Remove-Item "$env:APPDATA\crystal-price-system" -Recurse -Force -ErrorAction SilentlyContinue
```

- [ ] **Step 7：标记完成**

---

## Task 5：server/src/db.js 移除静默守卫

**Files:**
- Modify: `server/src/db.js:168-173`

- [ ] **Step 1：替换 `saveNow()`**

打开 `F:\summer\vs code\crystal-price-system\server\src\db.js`，把第 168-173 行：

```js
// 立即保存到磁盘
export function saveNow() {
  if (db) {
    const data = db.export()
    fs.writeFileSync(dbPath, Buffer.from(data))
  }
}
```

改为：

```js
// 立即保存到磁盘（数据库未初始化时抛错，避免静默丢失数据）
export function saveNow() {
  if (!db) throw new Error('saveNow 调用时数据库尚未初始化')
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}
```

- [ ] **Step 2：冒烟测试**

启动 `npm run dev`，新增一条记录，确认：
- 不抛异常
- `Documents\晶振报价管理系统\数据库\data.db` 的修改时间被更新

- [ ] **Step 3：标记完成**

---

## Task 6：client/src/stores/saveStatus.js Pinia Store

**Files:**
- Create: `client/src/stores/saveStatus.js`

- [ ] **Step 1：写入 store**

写入 `F:\summer\vs code\crystal-price-system\client\src\stores\saveStatus.js`：

```js
import { defineStore } from 'pinia'

// 保存状态机：idle → saving → saved | failed
export const useSaveStatusStore = defineStore('saveStatus', {
  state: () => ({
    state: 'idle',           // 'idle' | 'saving' | 'saved' | 'failed'
    lastSavedAt: null,        // Date 对象
    errorMsg: '',
    inflight: 0               // 并发计数
  }),
  getters: {
    statusText: (s) => {
      if (s.state === 'saving') return '保存中…'
      if (s.state === 'failed') return '保存失败'
      if (s.state === 'saved' && s.lastSavedAt) {
        const t = s.lastSavedAt
        const hh = String(t.getHours()).padStart(2, '0')
        const mm = String(t.getMinutes()).padStart(2, '0')
        const ss = String(t.getSeconds()).padStart(2, '0')
        return `已保存 ${hh}:${mm}:${ss}`
      }
      return '就绪'
    },
    statusColor: (s) => {
      if (s.state === 'saving') return '#f5a623'
      if (s.state === 'failed') return '#e53935'
      if (s.state === 'saved') return '#52c41a'
      return '#bbb'
    }
  },
  actions: {
    begin() {
      this.inflight += 1
      this.state = 'saving'
      this.errorMsg = ''
    },
    success() {
      this.inflight = Math.max(0, this.inflight - 1)
      if (this.inflight === 0) {
        this.state = 'saved'
        this.lastSavedAt = new Date()
      }
    },
    fail(msg) {
      this.inflight = Math.max(0, this.inflight - 1)
      this.state = 'failed'
      this.errorMsg = msg || '未知错误'
    }
  }
})
```

- [ ] **Step 2：标记完成**

---

## Task 7：client/src/components/SaveStatusBadge.vue UI 组件

**Files:**
- Create: `client/src/components/SaveStatusBadge.vue`

- [ ] **Step 1：写入组件**

写入 `F:\summer\vs code\crystal-price-system\client\src\components\SaveStatusBadge.vue`：

```vue
<template>
  <div class="save-badge" :class="store.state" :title="tooltip">
    <span class="dot" :style="{ background: store.statusColor }"></span>
    <span class="txt">{{ store.statusText }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSaveStatusStore } from '../stores/saveStatus.js'

const store = useSaveStatusStore()
const tooltip = computed(() => {
  if (store.state === 'failed') return '保存失败：' + (store.errorMsg || '请检查网络')
  if (store.lastSavedAt) return '上次保存：' + store.lastSavedAt.toLocaleString()
  return '尚未发生写入'
})
</script>

<style scoped>
.save-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  margin-left: 8px;
  border-radius: 6px;
  background: #f7f9fc;
  border: 1px solid #e4e8ef;
  font-size: 12px;
  color: #555;
  white-space: nowrap;
  user-select: none;
}
.save-badge.failed { background: #fff5f5; border-color: #ffcdd2; color: #c62828; cursor: pointer; }
.save-badge.saving { background: #fff8e6; border-color: #ffe0a3; color: #b8761e; }
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background .2s;
}
.save-badge.saving .dot { animation: pulse 1s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}
</style>
```

- [ ] **Step 2：标记完成**

---

## Task 8：client/src/utils/api.js 拦截器接入

**Files:**
- Modify: `client/src/utils/api.js`（在现有 interceptors 上扩展）

- [ ] **Step 1：在 import 区追加 store 引用**

把 `client/src/utils/api.js` 第 1 行：

```js
import axios from 'axios'
```

改为：

```js
import axios from 'axios'
import { useSaveStatusStore } from '../stores/saveStatus.js'
```

- [ ] **Step 2：替换 interceptors 段**

把第 17-32 行（两个 `http.interceptors.*.use(...)` 调用）整段替换为：

```js
http.interceptors.request.use(async config => {
  if (config.method !== 'get') {
    const token = await ensureToken()
    if (token) config.headers['x-auth-token'] = token
    // 写操作 → 进入保存中
    try { useSaveStatusStore().begin() } catch {}
  }
  return config
})

http.interceptors.response.use(
  res => {
    if (res.config.method !== 'get') {
      try { useSaveStatusStore().success() } catch {}
    }
    return res.data
  },
  err => {
    if (err.response?.status === 401) { localStorage.removeItem('crystal_auth_token'); ensureToken() }
    const msg = err.response?.data?.msg || '网络错误'
    if (err.config?.method && err.config.method !== 'get') {
      try { useSaveStatusStore().fail(msg) } catch {}
    }
    return Promise.reject(new Error(msg))
  }
)
```

> **依赖前置：** Pinia 必须在 store 使用前已 `app.use(createPinia())`。当前 `client/src/main.js:9` 已经满足；`api.js` 在组件中按需 import，所以 `useSaveStatusStore()` 调用时 Pinia 实例已就绪。`try/catch` 容错应对 `api.js` 被极早期模块（main.js 之前）import 的边缘情况。

- [ ] **Step 3：标记完成**

---

## Task 9：Dashboard.vue 工具栏接入徽章

**Files:**
- Modify: `client/src/views/Dashboard.vue`（line 29 之后插入 + script 区 import）

- [ ] **Step 1：模板插入**

打开 `client/src/views/Dashboard.vue`，找到第 29 行：

```html
        <button class="tb-btn calc-btn" @click="showCalc = true">&#128290; 报价计算器</button>
```

在其后**新增一行**：

```html
        <SaveStatusBadge />
```

- [ ] **Step 2：script 区 import 组件**

在 `Dashboard.vue` 的 `<script setup>` 顶部 import 区追加：

```js
import SaveStatusBadge from '../components/SaveStatusBadge.vue'
```

> **定位提示：** `Dashboard.vue` 的 `<script setup>` 通常在文件中下部，搜索 `import ` 找到现有 import 区，加在末尾即可（Vue 3 `<script setup>` 中 import 顺序无要求）。

- [ ] **Step 3：开发模式验证**

```powershell
cd "F:\summer\vs code\crystal-price-system"
npm run dev
```

操作：
1. 打开 Dashboard，看到 📒 报价计算器 右边有一个灰色「就绪」徽章
2. 点击「新增报价」→ 填一条 → 保存 → 徽章变黄「保存中…」→ 变绿「已保存 HH:mm:ss」
3. 关掉 server（PowerShell 杀掉 node 进程）→ 再编辑一条 → 徽章变红「保存失败」

- [ ] **Step 4：标记完成**

---

## Task 10：build/installer.nsh 卸载加固

**Files:**
- Modify: `build/installer.nsh`（重写 `customUnInstall` 宏）

- [ ] **Step 1：用完整新内容替换 installer.nsh**

把 `F:\summer\vs code\crystal-price-system\build\installer.nsh` **整个文件**替换为以下内容（保留原 `customInit` / `customInstall` 不动，仅重写 `customUnInstall` 并在文件**前面**新增 3 个工具函数——NSIS 中 Function 必须在引用它的代码展开前定义）：

```nsis
; ===== 安装前：备份数据到临时目录（在卸载旧版之前执行）=====
!macro customInit
  IfFileExists "$INSTDIR\晶振报价管理系统\数据库\data.db" 0 skipBackup
    CreateDirectory "$TEMP\晶振备份\数据库"
    CreateDirectory "$TEMP\晶振备份\规格书"
    CreateDirectory "$TEMP\晶振备份\模板"
    CreateDirectory "$TEMP\晶振备份\备份"
    CreateDirectory "$TEMP\晶振备份\Excel备份"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\数据库\*.*" "$TEMP\晶振备份\数据库"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\规格书\*.*" "$TEMP\晶振备份\规格书"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\模板\*.*" "$TEMP\晶振备份\模板"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\备份\*.*" "$TEMP\晶振备份\备份"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\Excel备份\*.*" "$TEMP\晶振备份\Excel备份"
  skipBackup:
!macroend

; ===== 安装后：恢复数据 =====
!macro customInstall
  IfFileExists "$TEMP\晶振备份\数据库\data.db" 0 tryAppData
    CreateDirectory "$INSTDIR\晶振报价管理系统\数据库"
    CreateDirectory "$INSTDIR\晶振报价管理系统\规格书"
    CreateDirectory "$INSTDIR\晶振报价管理系统\模板"
    CreateDirectory "$INSTDIR\晶振报价管理系统\备份"
    CreateDirectory "$INSTDIR\晶振报价管理系统\Excel备份"
    CopyFiles /SILENT "$TEMP\晶振备份\数据库\*.*" "$INSTDIR\晶振报价管理系统\数据库"
    CopyFiles /SILENT "$TEMP\晶振备份\规格书\*.*" "$INSTDIR\晶振报价管理系统\规格书"
    CopyFiles /SILENT "$TEMP\晶振备份\模板\*.*" "$INSTDIR\晶振报价管理系统\模板"
    CopyFiles /SILENT "$TEMP\晶振备份\备份\*.*" "$INSTDIR\晶振报价管理系统\备份"
    CopyFiles /SILENT "$TEMP\晶振备份\Excel备份\*.*" "$INSTDIR\晶振报价管理系统\Excel备份"
    RMDir /r "$TEMP\晶振备份"
    goto doneInstall
  tryAppData:
  IfFileExists "$APPDATA\crystal-price-system\data.db" 0 doneInstall
    CreateDirectory "$INSTDIR\晶振报价管理系统\数据库"
    CopyFiles /SILENT "$APPDATA\crystal-price-system\data.db" "$INSTDIR\晶振报价管理系统\数据库"
  doneInstall:
!macroend

; ===== 卸载器用：字符串查找（返回 needle 之后的子串；找不到返回空） =====
Function un.StrStr
  Exch $R1 ; 子串
  Exch
  Exch $R2 ; 主串
  Push $R3
  Push $R4
  Push $R5
  StrLen $R3 $R1
  StrCpy $R4 0
  loop:
    StrCpy $R5 $R2 $R3 $R4
    StrCmp $R5 $R1 found
    StrCmp $R5 "" notFound
    IntOp $R4 $R4 + 1
    Goto loop
  found:
    StrCpy $R1 $R2 "" $R4
    Goto done
  notFound:
    StrCpy $R1 ""
  done:
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Exch $R1
FunctionEnd

; ===== 卸载器用：简易字符串替换 =====
; 用法：Push haystack; Push needle; Push replacement; Call un.StrReplace; Pop result
Function un.StrReplace
  Exch $R0 ; replacement
  Exch
  Exch $R1 ; needle
  Exch 2
  Exch $R2 ; haystack
  Push $R3
  Push $R4
  Push $R5
  StrCpy $R3 ""
  StrLen $R5 $R1
  loopReplace:
    StrCmp $R2 "" doneReplace
    StrCpy $R4 $R2 $R5
    StrCmp $R4 $R1 doReplace
    StrCpy $R4 $R2 1
    StrCpy $R3 "$R3$R4"
    StrCpy $R2 $R2 "" 1
    Goto loopReplace
  doReplace:
    StrCpy $R3 "$R3$R0"
    StrCpy $R2 $R2 "" $R5
    Goto loopReplace
  doneReplace:
    StrCpy $R0 $R3
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
FunctionEnd

; ===== 卸载器用：从 JSON 行中提取 "dataDir":"<value>" 的 value =====
; 用法：Push line; Call un.ExtractDataDir; Pop result
Function un.ExtractDataDir
  Exch $R0   ; line
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  ; 1. 找 "dataDir"
  Push $R0
  Push '"dataDir"'
  Call un.StrStr
  Pop $R1
  StrCmp $R1 "" emptyOut
  ; 2. 跳过 "dataDir" 这 9 个字符
  StrCpy $R1 $R1 "" 9
  ; 3. 找第一个引号
  StrCpy $R2 0
  findQ1:
    StrCpy $R3 $R1 1 $R2
    StrCmp $R3 '"' q1Found
    StrCmp $R3 "" emptyOut
    IntOp $R2 $R2 + 1
    Goto findQ1
  q1Found:
    IntOp $R2 $R2 + 1
    StrCpy $R1 $R1 "" $R2
  ; 4. 找第二个引号
  StrCpy $R2 0
  findQ2:
    StrCpy $R3 $R1 1 $R2
    StrCmp $R3 '"' q2Found
    StrCmp $R3 "" emptyOut
    IntOp $R2 $R2 + 1
    Goto findQ2
  q2Found:
    StrCpy $R0 $R1 $R2
    ; 5. JSON \\ → \
    Push $R0
    Push "\\"
    Push "\"
    Call un.StrReplace
    Pop $R0
    Goto outDone
  emptyOut:
    StrCpy $R0 ""
  outDone:
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
FunctionEnd

; ===== 卸载后：询问是否彻底清除数据（默认保留 + 二次确认 + 自动开夹） =====
!macro customUnInstall
  Var /GLOBAL DataDir
  Var /GLOBAL CfgFile
  Var /GLOBAL CfgHandle
  Var /GLOBAL CfgLine
  Var /GLOBAL Extracted
  StrCpy $DataDir ""
  StrCpy $CfgFile "$APPDATA\crystal-price-system\user-data-path.json"

  ; ---- 1. 读取用户配置 ----
  IfFileExists "$CfgFile" 0 useDefault
    ClearErrors
    FileOpen $CfgHandle "$CfgFile" r
    IfErrors useDefault
    readLoop:
      FileRead $CfgHandle $CfgLine
      IfErrors readDone
      Push $CfgLine
      Call un.ExtractDataDir
      Pop $Extracted
      StrCmp $Extracted "" readLoop
      StrCpy $DataDir $Extracted
    readDone:
    FileClose $CfgHandle

  useDefault:
  StrCmp $DataDir "" 0 dirReady
    StrCpy $DataDir "$INSTDIR\晶振报价管理系统"
  dirReady:

  ; ---- 2. 数据目录不存在 → 直接结束 ----
  IfFileExists "$DataDir\*.*" 0 finish

  ; ---- 3. 首问（默认 = 否） ----
  MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION \
    "是否同时永久删除所有报价数据？$\n$\n数据位置：$DataDir$\n$\n选「否」将保留数据，下次安装可继续使用（推荐）。$\n选「是」将永久删除所有数据（不可恢复！）。" \
    /SD IDNO IDYES askAgain IDNO keepData

  askAgain:
    ; ---- 4. 二次确认 ----
    MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONEXCLAMATION \
      "再次确认：将永久删除以下目录及其所有内容：$\n$\n$DataDir$\n$\n此操作不可撤销！是否继续？" \
      /SD IDNO IDYES doDelete IDNO keepData

  doDelete:
    RMDir /r "$DataDir"
    Delete "$CfgFile"
    Goto finish

  keepData:
    ; ---- 5. 自动打开数据夹方便用户检查 ----
    ExecShell "open" "$DataDir"
    Goto finish

  finish:
    RMDir /r "$TEMP\晶振备份"
!macroend
```

- [ ] **Step 2：打包测试**

```powershell
cd "F:\summer\vs code\crystal-price-system"
npm run package:installer
```

期望产物：`dist-exe\晶振报价管理系统-安装版-v1.0.6.exe`

- [ ] **Step 3：人工卸载测试（4 个场景）**

测试机准备：先安装 `v1.0.6`，启动一次让它生成 `%APPDATA%\crystal-price-system\user-data-path.json`，录入一条数据。

| 场景 | 操作 | 预期 |
|------|------|------|
| A. 默认保留 | 卸载 → 弹窗按 Enter（默认「否」） | 数据保留 + 自动打开数据夹 |
| B. 关掉弹窗 | 卸载 → 弹窗按 × | 数据保留 + 自动打开数据夹 |
| C. 单选删除被拦 | 卸载 → 选「是」→ 二次弹窗按 Enter 或选「否」 | 数据保留 + 自动打开数据夹 |
| D. 真删 | 卸载 → 选「是」→ 二次弹窗选「是」 | 数据目录被删 + `user-data-path.json` 被删 + 不开夹 |

- [ ] **Step 4：标记完成**

---

## Task 11：端到端验收（手工冒烟）

**Files:** 无修改，纯人工验证。

- [ ] **Step 1：全新机器场景（模拟）**

清掉本机所有相关目录：

```powershell
Remove-Item "$env:APPDATA\crystal-price-system" -Recurse -Force -ErrorAction SilentlyContinue
# 注意：不要删除自己 Documents 下的实际数据！只清测试机
```

安装 `dist-exe\晶振报价管理系统-安装版-v1.0.6.exe`，期望首启弹选择器。

- [ ] **Step 2：升级场景（模拟）**

把当前 `Documents\晶振报价管理系统\` 临时备份为 `备份-v106-测试\`，删 `%APPDATA%\crystal-price-system\user-data-path.json`，把备份目录复制到一个 legacy 位置（如 `C:\fake-install\晶振报价管理系统\`），运行应用，期望自动迁移回 Documents。

- [ ] **Step 3：保存徽章 3 态**

按 Task 9 Step 3 的 3 个操作复测。

- [ ] **Step 4：卸载 4 场景**

按 Task 10 Step 3 复测。

- [ ] **Step 5：dist-exe 干净**

下次打包前，确认 `beforePack` 钩子生效：手工往 `dist-exe` 扔一个空文件 `dummy.txt`，再 `npm run package:installer`，期望 `dummy.txt` 不见，目录里只有 v1.0.6 产物。

- [ ] **Step 6：写验收报告**

把 Task 1-10 的"标记完成"汇总，附 Task 11 截图（手机/PC 都拍一张徽章状态），交付给祥哥。

---

## 风险与回退

| 风险 | 回退方案 |
|------|----------|
| 用户配置文件损坏 | `loadUserConfig` 已 try/catch 返回 null，自动走 legacy 探测 |
| NSIS 字符串函数未识别 | 已确认 `un.StrStr` / `un.ExtractQuoted` / `un.StrReplace` 均使用纯 NSIS 内置指令，无需插件 |
| `before-quit` 异步保存来不及 | `dbSaveNow()` + `fs.writeFileSync` 全同步，不存在异步问题 |
| Pinia store 在拦截器中过早 import | 已加 try/catch 容错 |
| 用户选了无写权限目录 | `resolveDataDir` 有写权限测试，失败回退到默认 |
| 旧用户跨盘迁移耗时 | 仅复制不删除，启动慢一次后续 OK；可在 splash 上加进度提示（本期不做） |

---

## 自检对照（Spec → Plan）

| Spec 章节 | 实现任务 |
|----------|---------|
| §3.1 M1 数据目录管理 | Task 3 + Task 4 |
| §3.2 M2 保存可视化 | Task 5 + Task 6 + Task 7 + Task 8 |
| §3.3 M3 NSIS 加固 | Task 10 |
| §3.4 M4 包体清理 | Task 1 + Task 2 |
| §5 版本号 1.0.6 | Task 1 Step 1-2 |
| §6 风险 R1-R5 | 上文「风险与回退」表 |
| §8 验收清单 9 项 | Task 11 完整覆盖 |
