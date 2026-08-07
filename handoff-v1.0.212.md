# 接力文档 v1.0.212

> 报价备注图片标识（主列表+弹窗）+ 图片预览关闭修复，最新 tag: v1.0.212

## 当前状态

**v1.0.212**，GitHub Release 三件套齐全（exe + blockmap + latest.yml）。工作区干净，全部已推送。

## 本会话已交付

| 内容 | 说明 |
|------|------|
| 📷 **主列表图片标识** | PriceTable 操作列在 📄 规格书旁新增 📷 标识（有备注图片时显示，数量>1 显示角标），点击打开图片预览 |
| 📷 **弹窗图片徽标** | 报价弹窗每行在「改」前新增 📷N 徽标（N=图片数），点击预览 |
| ✕ **图片预览可关闭** | 所有 van-image-preview（新增表单/详情页/主列表/弹窗）加 `closeable`（预览内右上角 X）+ `close-on-click-overlay`（点遮罩关闭），修复误点右上角把整个软件关闭的问题 |

## 需求确认（祥哥反馈）

1. 「上传图片保存后，没有像规格书一样在改后面有个标识，用户点击可以预览」
2. 「图片点开后没有地方可以关掉，点击右上角X直接整个软件都关闭了」

## 技术要点

- **标识位置**：主列表（PriceTable `.rimg-link`）+ 弹窗行（Dashboard `.rimgs` 按钮），都在「改」按钮旁边
- **数据解析**：Dashboard showDetail 给每条报价 q 加 `q.rimg`（解析 remark_images）；PriceTable 用 `rimgCount(item)` 直接解析
- **预览关闭**：`closeable` 显示预览内右上角 X（点击只关预览），`close-on-click-overlay` 点遮罩关闭——两个都加上，用户不会误点浏览器/Electron 窗口的关闭按钮
- 预览组件有多个实例（主列表 PriceTable + 弹窗 Dashboard + 新增表单 + 详情页），各用独立 state

## 验证证据

- 浏览器实机验证（截图 `quote-img-badge-popup.png`）：
  1. 主列表 RIMG-001 行操作列显示 📷改删 ✅
  2. 主列表 📷 点击 → 预览打开（closeable 关闭按钮可见）✅
  3. 预览关闭按钮 → 预览隐藏，应用保持 ✅
  4. 弹窗行显示 📷1 徽标（带数量）✅
  5. 弹窗 📷 点击 → 预览打开 ✅
  6. 弹窗预览关闭 → 弹窗和应用都保持 ✅

## 待办/未决策

- [ ] 导入价格日志是否改（①不生成 ②标记「📥导入初始价」）
- [ ] 祥哥 D 盘数据恢复善后确认
- [ ] 客户物料看板视图
- [ ] 客户物料 Excel 导入去重
- [ ] 报价备注图片导出/导入
- [ ] 移动端 MobileHome 详情显示备注图片

## 关键文件

| 文件 | 说明 |
|------|------|
| `client/src/components/PriceTable.vue` | 主列表 📷 标识 + 预览 |
| `client/src/views/Dashboard.vue` | 弹窗 📷 徽标 + 预览；showDetail 解析 q.rimg |
| `client/src/views/AddRecord.vue` | 预览加 closeable |
| `client/src/views/RecordDetail.vue` | 预览加 closeable |
| `quote-img-badge-popup.png` | 验证截图 |

相关记忆：[[handoff-v1.0.211]] [[handoff-v1.0.210]] [[browser-verify-rule]] [[release-after-change]]
