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

## 项目特有规则

- **🔥 改完代码必须发版** — 任何代码改动（修bug/加功能/改UI）完成后，必须：bump版本号 → `npm run package` → git commit+tag+push → GitHub Release。不发版祥哥没法点"检查更新"测试
- **发版必须打包 exe 验证**：不能只靠 `npm start` 开发版测试，必须 `npm run package` → 安装 exe → 确认功能正常
- **Electron 主进程文件改后自动重启**：`taskkill /f /im electron.exe` → 确认端口释放 → 重新启动
- **仅改前端 CSS/模板**：只需 `npm run build`，无需重启主进程
- **手机自动跳转**：App.vue 检测 UserAgent → `/mobile`
- **无鉴权**：局域网内部使用
- **软删除**：is_deleted=1，数据不物理删除
- **Windows 特定**：SSH/路径/端口排查等见 xiangge-env `env-windows.md`
