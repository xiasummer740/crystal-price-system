# crystal-price-system

> 晶振物料报价记录查询系统 — Electron + Vue 3 + Express + SQLite
> **v1.0.51** | 最后更新: 2026-07-02

## 快速启动

```bash
npm install            # 安装依赖（首次）
npm run build          # 构建前端
npm start              # Electron 开发模式
npm run dev:server     # 仅启动后端服务（3266端口）
```

## 验证

```bash
xnow verify            # build → lint → test → health → e2e
npm test               # 45 个测试（42 后端 + 3 前端）
npx playwright test    # 6 个 E2E 测试
```

## 当前状态

| 验证步骤 | 状态 |
|---------|:----:|
| build (前端编译) | ✅ |
| lint (ESLint) | ✅ |
| test (45个测试) | ✅ |
| health (API可达) | ✅ |
| e2e (Playwright) | ✅ |

## 架构

```
electron/main.js          → Electron 主进程（启动服务 + 窗口）
server/src/index.js       → Express 服务（:3266）
server/src/db.js          → sql.js 数据库操作
client/src/views/         → Vue 页面
client/src/components/    → 组件（PriceTable, SaveStatusBadge）
client/src/stores/        → Pinia 状态管理
```

## 数据库

- 位置: `%APPDATA%\crystal-price-system\user-data-path.json` → `{dataDir}/数据库/data.db`
- 真实数据当前在: `F:\文档\晶振报价管理系统\数据库\data.db`（138 条记录）
- 开发模式回退: `server/数据库/data.db`

## 本阶段完成

- [x] 规则12 模块分层（全局）
- [x] 单人模式（🟡降🔴）
- [x] 全栈验证链 build→lint→test→health→e2e
- [x] xnow verify / migrate / deploy / sync-env 命令
- [x] debt-tracker + env-sync hooks
- [x] Dashboard 拆分 → PriceTable 组件（1140→1027行）
- [x] 前端 Vitest 测试（3个 Store 测试）
- [x] E2E 核心流程测试（新增→保存→表格更新）
- [x] E2E 测试数据自清理
- [x] xnow release 自动重建前端
- [x] v1.0.50 → v1.0.51 发布

## 待办/已知问题

- Dashboard.vue 1027 行（popup 未拆）
- 前端组件测试未覆盖
- 无 TypeScript
- 无安全审查
