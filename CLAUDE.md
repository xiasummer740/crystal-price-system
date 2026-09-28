# crystal-price-system

> 全局规则见 `xiangge-env/CLAUDE.md`（17条规则 + 验证报告 + 独立复审）
> 本文件只含项目特有信息，不重复全局规则。

## Project Overview

晶振公司物料价格记录查询系统 — Electron 桌面应用程序。
PC 端双击 exe 运行，手机端局域网 WiFi 访问。
数据存储在本地 SQLite 文件，无需外部数据库。

## Tech Stack

- **桌面端**: Electron 33 — Express 后端 + Vue 前端
- **前端**: Vue 3 + Vite + Vant UI 4 + Pinia + Vue Router
- **后端**: Node.js + Express + sql.js（Electron 主进程 fork 启动）
- **移动端**: 手机浏览器 + PWA
- **Excel**: SheetJS (xlsx)
- **打包**: electron-builder (portable exe / nsis installer)

## Commands

```bash
npm install && cd server && npm install && cd ../client && npm install  # 首次装依赖
npm run dev       # 开发模式
npm run build     # 构建前端
npm start         # 启动桌面程序
npm run package   # 打包便携版 exe
```

## Architecture

```
Electron Main Process
  ├─ fork() → Express Server (:3266)
  │   ├─ /api/prices → CRUD
  │   ├─ /api/export → Excel 导出
  │   └─ /api/import → Excel 导入
  └─ BrowserWindow → http://localhost:3266
       ├─ PC: Dashboard.vue（CRUD + 导入导出）
       └─ Mobile: MobileHome.vue（搜索 + 卡片）
```

## Database

SQLite `server/data.db`，核心表 `material_prices`（14字段，软删除）。
索引: material_code, material_name, factory_code。

## 🔬 验证规则

- **所有新功能/修改开发完成后，必须在 headless 浏览器中真实验证通过才能发版**
- 使用 `browser-use` 工具打开真实页面、填写表单、保存、切换、检查结果
- 不允许仅靠代码审查或手动抽象测试就认为功能正常
- 验证通过后截图留证

## 项目特有规则

- **🔥 改完代码必须发版** — 任何代码改动（修bug/加功能/改UI）完成后，必须：bump版本号 → `npm run package` → git commit+tag+push → GitHub Release。不发版祥哥没法点"检查更新"测试
- **发版必须打包 exe 验证**：不能只靠 `npm start` 开发版测试，必须 `npm run package` → 安装 exe → 确认功能正常
- **Electron 主进程文件改后自动重启**：`taskkill /f /im electron.exe` → 确认端口释放 → 重新启动
- **仅改前端 CSS/模板**：只需 `npm run build`，无需重启主进程
- **手机自动跳转**：App.vue 检测 UserAgent → `/mobile`
- **无鉴权**：局域网内部使用
- **软删除**：is_deleted=1，数据不物理删除
- **Windows 特定**：SSH/路径/端口排查等见 xiangge-env `env-windows.md`

### 🚧 沙箱测试红线（2026-09-28 踩坑后立）

用显式 `DATA_DIR` 起沙箱跑测试，**会写祥哥的真实配置**，不只是读：

- 沙箱跑完**核对这三样**（`%APPDATA%\crystal-price-system\`，即
  `C:\Users\Administrator\AppData\Roaming\crystal-price-system\`）：
  ① `user-config.json` 的 **`dataDir` 字段**必须仍是 `G:\Users\Documents\晶振报价管理系统`
  ② `data-dir.txt`（UTF-16LE+BOM）必须仍是同一个路径 —— **`saveUserConfig()` 一次写这两个文件，
     只还原 json 会漏掉它**（2026-09-28 实测漏过一次；它同时是 NSIS 卸载器的数据目录依据）
  ③ 生产 `data.db` md5 仍为 `e912f8b02ba22d890db9123d7261529a`
  - 判据用**字段值**，不要用 `user-config.json` 的 md5 —— 该文件的 `setAt`/窗口几何
    被正常使用（挪一下窗口）就会变，md5 对不上**推不出**「dataDir 被污染」
  - 还原底牌：`G:\Temp\userconfig-v220-backup.json`（json）、`G:\Temp\userconfig-pristine.json`
- **写配置的口子不止一处**（已全部加闸，改代码时别再开新的）：
  `update:install` 的 `saveUserConfig()` → 靠 `dataDirFromEnv` 拦；
  `saveFullConfig()`（窗口布局，5 个调用点）→ 靠 `setEphemeralConfig()` 拦。
  **凡是会在主进程里写配置的按钮/回调，沙箱测试时都要当作「会污染真实配置」来防** ——
  别默认「我设了 `DATA_DIR`，配置就是安全的」。

> **教训**：`DATA_DIR` 只保证「读」不走错门，**不保证「写」不走错门**。

#### ⛔ 铁则：`DATA_DIR` 是**唯一**的沙箱开关，别想绕开它（2026-09-28 血账）

想在不起沙箱的情况下做对照实验（例如「验闸门有没有拦住写」），**不许**用这两个办法去
「换一个配置目录」——它们**都拦不住** `app.getPath('appData')`：

| 尝试 | 结果 |
|------|------|
| 设 `APPDATA=<临时目录>` 再起 Electron | ❌ Windows 上 Chromium 走 `SHGetKnownFolderPath`，**不读这个环境变量** |
| 传 `--user-data-dir=<临时目录>` | ❌ 只改 `app.getPath('userData')`，跟 `appData` 不是一个路径 |

**2026-09-28 实测代价**：以为 `APPDATA` 生效了，实际那次实验**读的是真实配置 ⇒ 打开的是生产数据目录**
（`G:\Users\Documents\晶振报价管理系统`），`syncArchive()` 在生产上跑了一遍。所幸那次是
**纯改名、零搬运**（报告 `【已归档】（无）`、文件总数 1063 与基线一致、`data.db` md5 未变），
窗口几何被我改掉后已整份还原。**但那是运气，不是设计。**

**因此立两条硬规矩**：

1. **凡是跑 Electron 的验证，一律带 `DATA_DIR=<沙箱>`**。要对照「闸门生效与否」，就
   写成**纯 Node 单元探针**（桩掉 `electron` 模块 + 把配置目录指到临时目录），**不要**靠
   起真 Electron 去凑对照 —— 拿生产做对照实验的成本远高于省下的那点真实度。
2. **启动后第一件事**：查一次「它到底打开了哪个数据目录」，**确认是沙箱再往下做**。
   最省事的判据是启动日志里的 `Window bounds:` —— 它来自 `user-config.json`，
   值不对就说明读的是真实配置，**立刻停手**，别等做完再看。
   （2026-09-28 就是做完了才回头读日志，`Window bounds: 260,66 1400x900` 这行才暴露。）
