# 晶振报价管理系统

晶振公司内部物料价格记录查询系统 — Electron 桌面应用。

PC 端双击 exe 即可运行，手机端通过局域网 WiFi 访问。数据存储在本地 SQLite，无需外部数据库。

## 下载安装

前往 [Releases](https://github.com/xiasummer740/crystal-price-system/releases) 下载最新版 `晶振报价管理系统-安装版-vX.X.X.exe`，双击安装即可。

## 功能特性

- 报价记录 CRUD + 分页搜索 + 多条件筛选
- Excel 批量导入 / 导出
- 自动备份（数据库保留 30 份，Excel 各保留 10 份）
- 局域网手机访问（PWA 离线缓存）
- 数据目录自定义（菜单可随时切换）
- 软删除（数据不物理删除）

## 技术栈

- **桌面端**: Electron 33
- **前端**: Vue 3 + Vite + Vant UI 4 + Pinia + Vue Router
- **后端**: Node.js + Express + sql.js
- **打包**: electron-builder (NSIS installer)

## 开发

```bash
# 安装依赖
npm install
cd server && npm install
cd ../client && npm install
cd ..

# 开发模式（Electron + Vite HMR）
npm run dev

# 打包安装版
npm run package:installer
```

## 数据目录

首次安装时会提示选择数据保存位置（推荐 D 盘或 E 盘）。所有数据（数据库、规格书、模板、备份、Excel 备份）都保存在该目录下，卸载时可选择保留或删除。

后续可通过菜单「文件 → 切换数据目录」迁移到新位置。

## 局域网访问

启动桌面端后，手机连接同一 WiFi，浏览器访问 `http://<PC的IP>:3266` 即可查询。
