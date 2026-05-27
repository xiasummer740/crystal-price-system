# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言规则

所有回复必须使用中文。代码注释、提交信息、文档都使用中文。

## Project Overview

晶振公司物料价格记录查询系统 — Electron 桌面应用程序。
PC 端双击 exe 即可运行，手机端通过局域网 WiFi 访问查看。
数据存储在本地 SQLite 文件，无需外部数据库。

## Tech Stack

- **桌面端**: Electron 33 — 包裹 Express 后端 + Vue 前端为一个独立 exe
- **前端**: Vue 3 + Vite + Vant UI 4 + Pinia + Vue Router
- **后端**: Node.js + Express + sql.js（内嵌在 Electron 主进程启动）
- **移动端**: 手机浏览器访问局域网地址 + PWA 离线缓存
- **Excel**: SheetJS (xlsx)
- **打包**: electron-builder (portable exe / nsis installer)

## Commands

```bash
# 安装依赖（首次）
npm install && cd server && npm install && cd ../client && npm install

# 开发模式 (Electron 窗口 + Vite HMR)
npm run dev

# 仅构建前端
npm run build

# 启动桌面程序 (开发模式，不打包)
npm start

# 打包为便携版 exe
npm run package

# 打包为安装版 exe
npm run package:installer
```

## Architecture

```
┌─────────────────────────────────────────────┐
│             Electron 桌面应用                  │
│  ┌──────────────┐    ┌──────────────────┐   │
│  │  Main Process │    │  Renderer Process │   │
│  │  electron/    │    │  (BrowserWindow)  │   │
│  │  main.js      │    │                   │   │
│  │               │    │  http://local      │   │
│  │  fork() 启动   │    │  host:3266        │   │
│  │  Express 服务  │    │                   │   │
│  └──────┬───────┘    └──────────────────┘   │
│         │                                    │
│  ┌──────▼───────────────────────────────┐   │
│  │       Express Server (:3266)          │   │
│  │  ├── /api/*     → CRUD API            │   │
│  │  ├── /api/export → Excel 导出          │   │
│  │  ├── /api/import → Excel 导入          │   │
│  │  └── /*         → client/dist/ 静态文件  │   │
│  └──────┬────────────────────────────────┘   │
│         │                                    │
│  ┌──────▼────────┐                           │
│  │  SQLite        │                           │
│  │  server/data.db│                           │
│  └───────────────┘                           │
└─────────────────────────────────────────────┘

         📱 手机浏览器 (同WiFi局域网)
         http://<PC的IP>:3266
```

## Database

SQLite 单文件 `server/data.db`，首次运行自动创建。
核心表: `material_prices` — 14 个字段，软删除标记 `is_deleted`。

索引: material_code, material_name, factory_code, first_inquiry_customer, created_at.

## API Endpoints

| Method | Path                    | Description              |
|--------|-------------------------|--------------------------|
| GET    | /api/prices             | 列表 + 搜索 + 分页         |
| GET    | /api/prices/:id         | 单条详情                  |
| POST   | /api/prices             | 新增记录                  |
| PUT    | /api/prices/:id         | 编辑记录                  |
| DELETE | /api/prices/:id         | 软删除                    |
| GET    | /api/prices/meta/options| 工厂/采购员列表（筛选用）    |
| GET    | /api/export             | 按条件导出 Excel           |
| POST   | /api/import             | 批量导入 Excel             |

## Frontend Routes

| Path          | View             | Description                |
|---------------|------------------|----------------------------|
| /             | Dashboard.vue    | PC 桌面主页: 表格 + CRUD + 导入导出 |
| /mobile       | MobileHome.vue   | 手机查询: 搜索 + 筛选 + 卡片列表 |
| /list         | RecordList.vue   | 通用列表页                   |
| /add          | AddRecord.vue    | 新增记录表单                 |
| /edit/:id     | AddRecord.vue    | 编辑记录（复用 AddRecord）    |
| /detail/:id   | RecordDetail.vue | 记录详情                    |

## Key Design Decisions

- **Electron 子进程模式**: Express 服务在 Main Process 中通过 `fork()` 启动，与渲染进程解耦
- **preload.js**: 通过 `contextBridge` 向渲染进程暴露局域网 IP 获取能力
- **移动端自动跳转**: App.vue 检测 UserAgent → 自动跳转到 `/mobile`
- **Vant 自动导入**: `unplugin-vue-components` 按需加载，模板中无需手动 import
- **币种**: `CNY` 人民币 / `USD` 美元 — 价格显示自动加 ¥/$ 前缀
- **筛选状态**: Pinia store 集中管理，跨视图共享
- **无需登录**: 局域网内部使用，无鉴权
- **软删除**: `is_deleted = 1` 标记，数据不物理删除
