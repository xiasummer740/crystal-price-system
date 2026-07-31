# 接力文档 v1.0.201

> 接力开发 — 客户物料模块完整开发（v1.0.189~201），最新 tag: v1.0.201

## 当前状态

当前版本 **v1.0.201**，已发布到 GitHub Release（含安装包）。工作区干净，代码已提交推送。

```
main @ 5b8b2a6 — feat: 已有规格书按客户迁移分文件夹 v1.0.201
```

## 项目概览

晶振报价管理系统（Electron 桌面应用）：
- 主功能：报价记录查询（v1.0.x 早期完成）
- **客户物料模块**（v1.0.190~201 新增）：按客户记录物料+规格书+状态+备选，独立窗口
- 其他模块：记事便签、地图地址、绩效明细、样品、行程规划

## 已完成（本轮 v1.0.189~201）

### 🎯 客户物料模块（核心）

| 版本 | 改动 |
|------|------|
| v1.0.189 | 记事附件 PDF 点击浏览器直接打开预览 |
| v1.0.190 | **新建客户物料模块**：数据库表 customer_materials + API + 独立窗口 + 导航按钮 |
| v1.0.191 | 改为**每客户一表** + 全系统客户联想搜索 |
| v1.0.192 | **整行状态颜色** + 状态/工厂/日期筛选 + **备选物料**(编码/名称/工厂/成本价) |
| v1.0.193 | **规格书上传/打开** + 日期排序 + 列宽记忆 + 点击复制 + 物料名称富文本(**文字**→橙色高亮) |
| v1.0.194 | 富文本**B高亮按钮**(选中文字点击) + 规格书**拖动/微信Ctrl+V粘贴**上传 |
| v1.0.195 | 修规格书打开 `?name=` 参数问题 + 列宽放宽 + 无规格书不显示📄 |
| v1.0.196 | 列宽无限制(0.1px) + 去掉复制hover图标 + **弹窗可调大小**(resize:both) |
| v1.0.197 | **列宽真正可缩到0.1px**（table-layout:fixed + 表格总宽=列宽和 + 窄列去内边距） |
| v1.0.198 | ‹返回客户列表(不关窗) + **客户搜索支持物料型号** + **客户物料自动备份** + 一页全部显示 |
| v1.0.199 | 表单点空白不关闭 + 输入框粘贴不误判规格书 |
| v1.0.200 | 规格书**按客户分文件夹** + 同名去重 + 启动自动清理(1)(2)副本 |
| v1.0.201 | 已有规格书**启动自动迁移**到客户文件夹(不破坏报价系统引用) |

### 客户物料模块功能全览

- **每客户一表**：选客户 → 看该客户物料清单；客户卡片列表页
- **5种状态**：报价🔵 规格书🟣 送样🟢 下散单🟠 下批量🟢（整行浅色染色）
- **筛选**：状态/工厂/日期范围/关键字，一键清除
- **规格书**：编辑弹窗上传(点击/拖动/粘贴)，表格📄打开(系统默认程序)
- **备选物料**：每条主料可加多条备选(编码/名称/工厂/成本价)，hover tooltip 查看
- **富文本**：`**文字**` → 橙色加粗高亮（B高亮按钮辅助）
- **列宽**：拖动任意调整 0.1px~无限，localStorage 记忆
- **点击复制**：点单元格文字即复制
- **自动备份**：新增/编辑/删除/导入触发 Excel 备份(5秒节流,保留5份)

## 未完成/待办

- [ ] 客户物料模块无"看板/图表"视图（目前只有表格）
- [ ] 规格书迁移后若客户改名，旧文件夹不自动跟随（需手动或重迁移）
- [ ] 报价系统规格书尚未按品类/物料分文件夹（仍根目录，用户未要求）
- [ ] 移动端(PWA)暂无客户物料入口（目前仅桌面窗口）

## 关键技术决策

- **规格书存储结构**：
  ```
  DATA_DIR/规格书/                    ← 报价系统规格书（根目录）
  DATA_DIR/规格书/客户物料/{客户名}/   ← 客户物料规格书（按客户分）
  ```
- **上传接口** `/api/upload-spec` 支持 `?folder=` query 参数（不能放 FormData body，multer 解析 file 时 req.body 未就绪）
- **去重**：目标目录已有同名文件 → 写临时文件→handler 检测→复用已有 URL，不重复存储
- **启动时执行**（server/src/index.js）：
  - `cleanupDuplicateSpecs()`：合并 `(1)(2)` 重复副本 + 更新 DB 引用
  - `migrateSpecsToCustomerFolders()`：老规格书按客户迁移（报价系统引用同文件→保留根目录副本）
- **列宽可缩到0.1px的3个关键**：`table-layout: fixed` + 表格 width=各列宽之和 + 窄列(<20px)去内边距
- **客户搜索型号**：`/api/materials/customers/search` 除客户名外还匹配 jkx_code/material_code/material_name，点击客户后自动把型号词作为物料筛选关键词
- **备份机制**：excelBackup.js 支持 prices/samples/notes/map/materials 五类，写操作 triggerBackup

## 关键文件说明

| 文件 | 说明 |
|------|------|
| `server/src/routes/materials.js` | 客户物料 CRUD + 搜索 + 导入导出 + 状态配置 + 自动备份触发 |
| `server/src/views/Materials.vue` | 客户物料页面（列表/客户选择/表单/规格书/备选/列宽） |
| `server/src/db.js` | customer_materials 表结构 + 兼容迁移列 |
| `server/src/utils/export.js` | exportMaterials() Excel 导出 |
| `server/src/utils/excelBackup.js` | 五类数据自动备份 |
| `server/src/index.js` | 规格书上传(分文件夹+去重) + 启动清理/迁移 |
| `electron/main.js` | open-spec IPC(去?name=参数) + openMaterialsWindow 独立窗口 |
| `client/src/utils/api.js` | 物料/客户/工厂/规格书 API 函数 |
| `client/src/router/index.js` | /materials 路由 |
| `client/src/views/Dashboard.vue` | 导航栏「📦 客户物料」按钮(记事和地图中间) |

## 技术踩坑记录

1. **upload-spec folder 参数**：multer 的 destination 回调执行时 req.body 可能未解析 → 必须用 `req.query.folder`
2. **规格书打开报错**：URL 带 `?name=` 会拼进文件名 → open-spec 必须 `split('?')[0]`
3. **列宽缩不动**：`table-layout:auto` 按内容撑开 + `width:max-content` 内容驱动 + 16px内边距 → 三处全改
4. **重复规格书**：老逻辑加 `(1)(2)` 后缀 → 启动清理合并
5. **Excel粘贴被当图片**：输入框内粘贴 → onFormPaste 需检查 target 是 INPUT/TEXTAREA 就放行
6. **表单点空白关闭误触**：去掉 overlay 的 @click="showForm=false"
7. **客户物料规格书/报价规格书混一起**：上传时传 folder=`客户物料/{客户名}` 分区
8. **打包含数据库**：electron-builder `files` 需排除 `!server/**/数据库` 和 `!server/**/data.db`

## 下一步建议

- 客户物料可加"看板视图"（按状态分组拖拽，参考 Notes.vue 的 kanban）
- 若客户改名，可加"批量迁移规格书文件夹"功能
- 报价系统规格书分类存放（若后续有需要）
