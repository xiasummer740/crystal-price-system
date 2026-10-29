# v1.0.253 交接（公司资料 → 资料柜：文件夹 + 过期提醒）

> 2026-10-29 · 已发版：https://github.com/xiasummer740/crystal-price-system/releases/tag/v1.0.253

## 需求

「公司资料」除了营业执照/开票资料，还要放各种**体系证书**：
- 不同类目用文件夹，名字「日期 + 自定义」
- 单个文件能设**过期时间**（年审提醒）
- 上传支持 点击 / 拖入 / Ctrl+V 粘贴

## 实现

### 数据

DB 迁移（`server/src/db.js`）：

- 新表 `company_doc_folders(id, owner_type, owner_name, name, created_at, UNIQUE(owner_type,owner_name,name))`
- `company_docs` 新增 `folder_id INTEGER DEFAULT 0`、`expires_at TEXT DEFAULT ''`

旧资料 `folder_id=0`，UI 里显示为虚拟文件夹「未分类」，不迁移、不丢数据。

### 后端（`server/src/routes/companyDocs.js`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/folders` | 文件夹列表 + 每个的 文件数 / 已过期 / 30 天内到期 + 未分类统计 |
| POST | `/folders` | 新建（名字空则默认 `YYYYMMDD-新文件夹`） |
| DELETE | `/folders/:id` | 只允许删空文件夹 |
| GET | `/docs?folder_id=` | 按文件夹列文件（不传 = 全部，兼容旧调用） |
| POST | `/upload?folder_id=` | 文件落到 `公司资料/<客户|自己公司>/<归属>/<文件夹名>/` |
| POST | `/docs/:id/expiry` | 设/清过期时间（`YYYY-MM-DD` 或空） |

### 前端

- 新组件 `client/src/components/CompanyDocFolders.vue`
  - 文件夹网格：名称、文件数、过期/将到期徽标
  - 文件夹内：拖入区 + 文件列表；文件行有 过期徽标（已过期红 / ≤30 天橙 / 有效至灰）
  - 点过期徽标弹窗设日期；上传后自动刷新
  - 预览（图片内嵌，其它新窗口）、下载、复制文件、资源管理器定位、删除
  - 删除空文件夹
- `client/src/views/CompanyDocs.vue`
  - 客户 tab：左客户列表 + 右资料柜
  - 自己公司 tab：每个主体卡片下挂自己的资料柜（多抬头不串）
  - 去掉原来的「分类下拉 + 平铺上传」，统一走文件夹
- `client/src/utils/api.js`：`fetchDocFolders / createDocFolder / deleteDocFolder / setDocExpiry`，
  `fetchCompanyDocs(ownerType, ownerName, folderId)`、`uploadCompanyDocs({ folderId })`

## 验证

- API：新建 `20261029-ISO9001` → 上传 → 设 `2026-11-15` 过期 → 文件夹统计 `1 个 / 将到期 1`
- UI（开发版）：自己公司 → 新建（默认名 `20261029-`）→ 上传 PDF → 设过期 →
  文件显示「17 天后到期」，文件夹卡片显示将到期徽标
- 打包版 1.0.253：`/api/company-docs/folders` 返回同一文件夹与统计

## 已知限制 / 下次可加

- 文件夹**只有一层**，不支持嵌套/重命名/文件移动（可后续加「移动到…」）
- 过期只做界面提醒，没有到期弹窗/汇总页（可加「证书到期看板」）
- 旧资料都在「未分类」，需要的话可以批量归入文件夹
- 上传单文件 ≤20MB、一次 ≤9 个（沿用原限制）
