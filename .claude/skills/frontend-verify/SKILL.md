---
name: frontend-verify
description: 前端（Vue 3 + Vite）改动后的端到端验证流程，适用于 crystal-price-system
---

# 前端改动验证流程

> 任何前端改动（组件、页面、样式、API 调用）必须先跑完本流程才能宣布完成。

## 启动验证环境

1. 构建前端：`npm run build`
2. 用 Bash 的 `run_in_background` 启动后端服务：`node server/src/index.js`
3. 等待服务就绪（轮询 `http://localhost:3266/api/prices?limit=1` 直到返回 200）

## 验证清单

### 1. 页面可访问
- [ ] `GET http://localhost:3266/` 返回 200
- [ ] 响应包含 `<!DOCTYPE html>` 或 Vue 挂载点
- [ ] `GET http://localhost:3266/api/prices?limit=1` 返回 200 + JSON

### 2. 改动点验证
- 如果改了 UI 组件 → 确认对应路由渲染正常
- 如果改了 API 调用 → 确认请求/响应格式正确
- 如果改了样式 → 确认元素 class/样式存在

### 3. 无退化
- [ ] 后端无异常日志（grep `Error|ERR!|error`）
- [ ] 前端构建无 warning
- [ ] 其他功能页面能正常打开

## 停止条件

全部验证项通过后宣布完成。如果验证失败：

1. 贴关键错误信息
2. 判断是已知问题还是新问题
3. 修完重跑验证
