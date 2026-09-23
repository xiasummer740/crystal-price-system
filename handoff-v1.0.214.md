# 接力文档 v1.0.214

> 表头排序 + 列宽恢复默认 + 三处排序修正 + 发布脚本两处潜伏缺陷，最新 tag: v1.0.214

## 当前状态

**v1.0.214**，GitHub Release 三件套齐全（exe 114.2MB + latest.yml + blockmap），2026-09-23 发布。
Release: https://github.com/xiasummer740/crystal-price-system/releases/tag/v1.0.214

工作区干净。**下一件大事：客户资料归档**（见「下一步」）。

## 本会话已交付

| 内容 | 说明 |
|------|------|
| ✨ **客户物料表头点击排序** | 点一下升序 ▲ / 再点降序 ▼ / 第三下回默认日期倒序；「操作」列不参与 |
| ⚙️ **每列对齐可选** | 列设置面板，每列选靠左/中/右，存 localStorage |
| 🛟 **列宽恢复默认** | 列宽能拖到 0.1px 后抓不回来，给一条退路 |
| 🐛 **三处排序修正** | 见下「对抗性复审」 |
| 🔧 **发布脚本两处修复** | 见下「发布脚本的坑」 |

## 对抗性复审挖出的 1 条真缺陷 + 4 条记录级

- 🔴 **非数字报价被静默折成 0 → 排序给出错误顺序**
  `CAST('￥100' AS REAL)` = 0 →「￥100」排到「9」前面；`'1,000'` 变 1；`'面议'` 变 0。
  报价框是**纯文本框**、Excel 导入也原样透传，这些都写得进去，且**界面无任何提示**。
  修：先剥 `￥ ¥ 元 , 全角空格`，再要求「长得像数字」才 CAST；不像的按「没填价」→ NULL → 沉底。
  **取舍：沉底是看得见的，折成 0 是看不见的** —— 宁可让它显眼地掉到末尾，也不悄悄排错。
- **空备注/空名称升序挤满第一屏** —— 我自己的注释写了这条理由，却只对数值列生效（自相矛盾）。修：统一 `NULLIF(TRIM(col),'')` + `NULLS LAST`
- **状态列按汉字编码排**（下批量→下散单→报价→规格书→送样），跟生命周期无关。修：改用 `STATUS_CONFIG` 的业务序
- **列宽拖到 0.1px 后抓不回来** —— 复审列为「存疑」，实测**证实成立**。⚠️ 我第一个探针用 `elementFromPoint` 打点返回 `col-resize`，差点据此说「没坑」——那个点其实已落到**邻列**手柄上。**打点 ≠ 能拖**，必须做「到底能不能拖回来」这个决定性测试
- **「前端 3/3」与本次改动无关**（那是 Pinia store 单测）—— 属证据标注不实，已删除

## 发布脚本的坑（本次发版过程中暴露）

两个 bug 让 v1.0.214 第一次打包成了 `1.0.213.exe`：

### 1. 🔴 版本号替换静默失效

```powershell
# ❌ 错的：PowerShell 把 'A' + $x + '"', 'B' + $y + '"' 解析成拼接/数组，不是两个参数
$content -replace '"version":\s*"' + $CurrentVersion + '"', '"version": "' + $NewVersion + '"'

# ✅ 对的：加括号
$content -replace ('"version":\s*"' + [regex]::Escape($CurrentVersion) + '"'), ('"version": "' + $NewVersion + '"')
```

**最坑的是它不报错**：替换没生效、写回原内容，脚本照样打印 `[OK] 1.0.213 -> 1.0.214`，
electron-builder 读到旧版本号，打出一个版本号错误的包。

**教训：打印 `[OK]` ≠ 核对过。凡是「改了就该变」的地方，必须读回来确认。**
已在脚本里加写回后读回核对，对不上直接 `exit 1`。

### 2. 产物名已是英文后「自己拷自己」

`nsis.artifactName` 改成英文名后，`$InstallerPath` 与 `$InstallerENPath` 是**同一个路径**，
`Copy-Item` 抛「无法用自身覆盖自身」，因 `$ErrorActionPreference = 'Stop'` 直接终止脚本。
清理步骤里 `Remove-Item $InstallerENPath` 同理会把刚打好的产物删掉。两处都已加同路径跳过。

### 3. Clear-Host 在无终端环境抛「句柄无效」

改为 `try { Clear-Host } catch {}`，让发版脚本可被自动化调用。

## 验证证据

- 后端 **70/70**（排序相关 14 条 = 9 基础 + 5 边界）；前端 3/3（⚠️ 与本次改动无关，只说明没跑挂）
- 服务端实测（隔离沙箱；真实库 mtime 未变）
  - 报价升序 `9 | ￥100 | 空 | 面议`、降序 `￥100 | 9 | 空 | 面议`
  - 状态升序 `报价 → 送样 → 下散单 → 下批量`（业务序，非编码序）
  - 物料名称升序 AAA/BBB/CCC 之后空名称沉底
- 浏览器实机：排序三态 ✓ / 操作列不可排 ✓ / 拖列宽不误触发排序 ✓ / 列宽恢复默认 ✓
- 截图 `.playwright-mcp/214-evidence/06-price-sort-final.png`、`07-colset-panel.png`
- 发布后核对：Release 三资产齐全（exe / latest.yml / blockmap），tag `v1.0.214` 已推

## 遗留问题

- [ ] `pageSize=abc` → 接口 500（**旧代码同样如此**，非本次引入）
- [ ] `showAll()` 把 pageSize 设 100000 后，分页条因 `total > pageSize` 不成立而消失、回不到分页（旧代码）
- [ ] **Excel 式表头筛选** — 每列表头点开勾选该列的值。**必须服务端做**：表格是服务端分页的，只筛当前页会漏掉未加载的值 = 假筛选

## 下一步：客户资料归档（大改动，方案已定稿）

祥哥要按客户名组织数据目录 + 📁 客户目录按钮 + 另一台电脑装完自动整理。

**已用真实数据（他搬来的 rar）摸清底细，关键结论**：
- **报价记录无法按客户拆** —— `material_prices` 没有 customer 列，`first_inquiry_customer` 全是简称，**能对上完整客户名的 0 条** → `报价记录.xlsx` 只能放 `客户管理` 外面
- 客户文件夹 63 个；记事图片 111 张可 100% 归位（49 个「客户+日期」桶）；**`notes` 表没有 `date` 列**，只能取 `created_at`
- **DB 里路径是 percent-encoded**，`LIKE '/api/specs/客户物料/%'` 永远匹配不上
- 🔴 **发现生产故障**：21 条<客户A>规格书 404 —— `migrateSpecsToCustomerFolders()` 靠「根目录还有没有源文件」决定要不要修，文件已搬走就永远跳过，**自己造成的错位修不回来**

完整方案与真实数据摸底详见 `PROGRESS.md`。

## 关键文件

| 文件 | 说明 |
|------|------|
| `client/src/views/Materials.vue` | 表头排序 + 列设置面板 + 列宽恢复默认 |
| `server/src/routes/materials.js` | `sortExprOf()` / `PRICE_VALUE` / `EMPTY_AS_NULL` / `STATUS_VALUE` |
| `tests/api-materials.test.js` | 排序 9 条 + 排序边界 5 条 |
| `scripts/release.ps1` | 一键发布（本次修了 3 处） |

相关记忆：[[handoff-v1.0.213]] [[handoff-crystal-price-archive]] [[browser-verify-rule]] [[release-after-change]] [[release-blockmap-pitfall]]
