# v1.0.254 交接（资料柜：重命名 + 移动文件）

> 2026-10-29 · 已发版：https://github.com/xiasummer740/crystal-price-system/releases/tag/v1.0.254

## 这版加的

1. **文件夹重命名**：文件夹栏「重命名」；改完磁盘目录一起改名，库里每个文件的 `file_path` 同步更新
2. **文件移动**：文件行「📂」→ 选目标文件夹（含「未分类」）；跨客户/主体禁止

## 后端（`server/src/routes/companyDocs.js`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/folders/:id/rename` | 改文件夹名 + 移动磁盘目录 + 更新文件相对路径 |
| POST | `/docs/:id/move` | 移动文件到目标文件夹（`folder_id=0` → 未分类） |

细节：

- 重命名前检查同名文件夹（库里 + 磁盘）
- 移动时目标目录不存在会自动建；同名文件自动加 `_1` 后缀
- 移动目标必须和文件同 `owner_type + owner_name`，不能跨客户

## 前端

`client/src/components/CompanyDocFolders.vue`

- 文件夹内标题栏：`‹ 返回文件夹 · 文件夹名 · 重命名 · 删除文件夹`
- 文件行：新增「📂 移动到别的文件夹」，弹窗选目标（下拉列出当前归属下所有文件夹 + 未分类）
- `client/src/utils/api.js`：`renameDocFolder / moveCompanyDoc`

## 验证

- API：文件夹 `20261029-ISO9001` → 改 `20261029-ISO9001-2026`，文件 `file_path` 跟着变；
  文件移到「未分类」再移回，路径/统计都正确
- UI：重命名弹窗、移动弹窗（选项 = 未分类 + 已有文件夹）都能打开；打包版 rename 接口 200
- 打包版 1.0.254 启动正常

## 还没做

- 文件夹嵌套
- 证书到期总览/首页提醒
- 批量移动（目前一次一个文件）
