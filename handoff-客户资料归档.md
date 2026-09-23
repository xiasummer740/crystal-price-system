# 接力文档 · 客户资料归档（进行中，未发版）

> 上一版 v1.0.214 已发布 · 本功能目标版本 v1.0.215（未发）
> 完整方案 / 影响面分析 / 搬家映射表 → 见 `PROGRESS.md` 的「当前工作」一节（权威源，本文件不重复抄）

---

## 一句话目标

数据目录下的文件**按客户归档**，加一个「📁 客户目录」按钮直接打开某客户文件夹；
另一台电脑装完软件要**自动整理**已有全部内容。

## 当前状态（2026-09-23）

| 阶段 | 状态 |
|------|------|
| 方案定稿（祥哥确认） | ✅ |
| 影响面分析（映射表 + 8 个接触点） | ✅ 见 PROGRESS.md |
| **地基模块已写** | ✅ 两个新文件，**没接线** |
| **业务接线** | ❌ **0 行** |
| 沙箱实跑 / 幂等验证 | ❌ 没跑过 |
| 测试 | ❌ 没有 |

### 已写好的地基（未提交、未接线）

| 文件 | 行数 | 作用 |
|------|------|------|
| `server/src/utils/customerArchive.js` | 318 | 路径助手：`DIR`/`LEGACY` 常量、URL ↔ 磁盘路径互转、`safeSegment`、`safeFilename`、`rehomeFiles()` |
| `server/src/utils/archiveSync.js` | 487 | 搬迁引擎：`syncArchive()`（备份→复制→改库落盘→确认后才删源→写报告）+ `verifyReferences()` 自检 |
| `server/src/utils/export.js` | +4/−2 | `exportMaterials(customer)` 加了按客户筛选 |

**诚实口径**：这三个文件 `node --check` 全过，但 **`syncArchive()` 一次都没执行过，没有任何调用方，没有测试**。
「语法过 ≠ 能跑」——离能交差还差整条接线 + 沙箱实跑。

## 接力第一步：把这些线接上

按顺序，每步都有明确落点（详见 PROGRESS.md「影响面分析」表）：

1. `server/src/index.js` 挂新 static：`/api/cust`（根=`客户管理/`）、`/api/quote-specs`、`/api/quote-images`；**旧 4 条路由保留只读兜底**
2. `server/src/index.js:339-427` **删掉** `migrateSpecsToCustomerFolders` / `migrateQuoteSpecsToCategoryFolders`（被新迁移取代）
3. `specUpload`（`index.js:162-224`）folder 语义改为「相对 DATA_DIR 的路径」；`routes/materials.js`、`routes/notes.js`、`routes/prices.js` 三处上传同步改
4. `index.js` 启动时调 `syncArchive()`
5. 前端 6 处 `url.startsWith('/api/specs/')` 加新前缀；`electron/main.js` 建新子目录 + `open-spec` 按 URL 前缀解析
6. 沙箱实跑 + 连跑两次验幂等

## 🔴 必须防的坑（都是真实踩出来的）

- **`migrateSpecsToCustomerFolders()` 靠「根目录还有没有源文件」决定要不要修** → 文件已经搬走了就永远跳过，**自己造成的错位永远修不回来**。生产机上 21 条国润聚源规格书 404 就是这么来的。新迁移必须能修自己的历史错误。
- **DB 里的路径是 percent-encoded**（`/api/specs/%E5%AE%A2...`）→ `LIKE '/api/specs/客户物料/%'` **永远匹配不上**，这种护栏等于没有。
- **`material_prices` 没有 customer 列**，只有 `first_inquiry_customer`，且全是简称（`国润`、`高起乐、`），**能和完整客户名对上的 0 条** → 「报价记录.xlsx」只能放在 `客户管理/` 外面，这不是偏好是唯一解。
- **`notes` 表没有 `date` 列** → 日期只能取 `created_at`。同一天同一客户多条记事的：5 处 → 一天一个 `记事.txt`，内部按时间分节。
- **重名客户 sanitize 后撞车**（`A/B` 与 `A_B`）→ 迁移前检测，命中就**停下问祥哥**，不自动合并。
- **孤儿文件**（记事图片库里 29 张没主）**不动**，留原地并在报告里列数 —— 不猜、不乱归户。

## 验收标准（硬指标，缺一条不算完）

搬完后逐条自检：
1. DB 里每个文件引用都能解析到磁盘上**真实存在**的文件（0 断链）
2. 磁盘上每个归档文件都**有主**（被 DB 引用），或**在报告里被明确列为孤儿**
3. **连跑两次结果一致**（幂等）

## 环境事实（别搞错）

| 项 | 值 |
|----|----|
| **生产数据目录** | `G:\Users\Documents\晶振报价管理系统`（534 文件 / 169.8MB）—— 判定依据是 `%APPDATA%\crystal-price-system\user-config.json` 的 `dataDir` |
| **摸底副本（沙箱用这个）** | `G:\Temp\crystal-realdata` |
| **原始 rar** | `D:\xwechat_files\wxid_un7rfl04uj4a22_e31e\msg\file\2026-09\晶振报价管理系统.rar`（RAR5；Windows 自带 `tar -xf` 就能解，不用 7z） |
| **开发库** | `server\数据库\data.db`（8-17 那份 232KB，**没被动过**） |
| 真实库现状 | 客户 109 · `material_prices` 514（未删 71）· `price_logs` 828 · `customer_materials` 282 · `notes` 71 |

⚠️ **别拿 G 盘生产目录当试验场** —— 先在 `G:\Temp\crystal-realdata` 跑通再说。

---

相关记忆：[[handoff-crystal-price-archive]] [[crystal-price-data-location]] [[browser-verify-rule]] [[verify-fresh-session-cache-mask]]
