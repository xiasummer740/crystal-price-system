# 接力文档 v1.0.188

> 接力开发 — 规格书功能优化完成，最新 tag: v1.0.188

## 当前状态

当前版本 **v1.0.188**，已发布到 GitHub Release（含安装包）。
代码已提交推送，工作区干净。

```
main @ cf606dd — fix: 规格书打开方式改为系统默认程序（如双击文件夹） v1.0.188
```

## 最近完成的工作

### 规格书功能重做（v1.0.184~188）

| 版本 | 改动 |
|------|------|
| v1.0.184 | multer 中文编码修复（Buffer.from latin1→utf8），规格书上传移入"编辑产品参数"弹窗，batch-update-specs 加入 spec_document |
| v1.0.185 | 修复 upload-spec 变量名错误 `file`→`req.file` |
| v1.0.186 | 规格书显示解码文件名而非 URL 编码（`decodeURIComponent`） |
| v1.0.187 | 修复 openExternal 相对路径被当文件夹打开的问题 |
| v1.0.188 | **最终方案**：点规格书 → `shell.openPath()` → 系统默认程序打开（像双击文件夹） |

### 其他之前完成的

- 工厂编号快捷选填写入正确字段 `factory_code`（v1.0.181）
- 更新下载 ECONNRESET 修复 + 重试机制 + 下载速度显示（v1.0.182）
- 筛选栏单行布局 + 动态标题 + 价格变更涨跌幅显示（v1.0.183）

## 关键架构说明

### 规格书流程

```
前端点规格书链接
  → openExternal() 识别 /api/specs/ 开头
  → window.electronAPI.openSpec(url)
  → IPC open-spec（electron/main.js）
  → 拼本地路径: DATA_DIR/规格书/{decodeURIComponent(filename)}
  → shell.openPath(filePath)  → 系统默认程序打开
```

上传时返回：
- `url`: `/api/specs/{encodeURIComponent(filename)}`（存数据库 `spec_document`）
- `filename`: 解码后的原始文件名（前端显示用）

### 规格书存储位置

```
DATA_DIR/规格书/{原始文件名}.pdf
```

由 Express 静态服务 `/api/specs` 提供 HTTP 访问，同时 Electron 的 IPC open-spec 通过本地路径打开。

### 编辑产品参数弹窗

Dashboard.vue `showSpecEdit` popup:
- 技术参数字段（material_code 到 temperature）+ spec_document
- `batch-update-specs` API 批量更新同物料编码的所有记录
- 支持规格书拖入/点击上传/粘贴链接/删除

## 待办/潜在问题

### 用户未明确但可能的需求
- 规格书上传后自动关联到同物料编码的所有记录（已在 batch-update-specs 支持）
- 旧数据中 `spec_document` 存的是完整 URL（`/api/specs/...`），新上传也是，兼容

### 已知问题
- （无已知未修复问题）

## 建议下次会话使用的技能

- `systematic-debugging` — 如有新 bug 报告
- `browser-use` — 前端验证
- `handoff` — 再次接力

## 相关文件

| 文件 | 说明 |
|------|------|
| `electron/main.js:682-690` | IPC open-spec 处理 |
| `electron/preload.cjs:17-18` | openExternal + openSpec 暴露 |
| `server/src/index.js:138-184` | 规格书上传 + 静态服务 |
| `server/src/routes/prices.js:229-249` | batch-update-specs |
| `client/src/views/Dashboard.vue:383-410` | 编辑产品参数弹窗 |
| `client/src/views/AddRecord.vue:118-126` | 新增报价表单规格书 |
| `client/src/views/RecordDetail.vue:35-39` | 详情页规格书显示 |
| `client/src/components/PriceTable.vue:63` | 表格 📄 图标 |
