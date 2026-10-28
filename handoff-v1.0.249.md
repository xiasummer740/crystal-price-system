# v1.0.249 交接（生成报价单）

> 2026-10-28 · 已发版：https://github.com/xiasummer740/crystal-price-system/releases/tag/v1.0.249

## 需求

按 `D:\夏天\客户资料\晶科鑫报价单2026-5-20后.docx` 做一个「生成报价单」，
参考订单模块的做法：选客户 → 带资料/物料 → 出 Word + PDF → 存到客户名下。

## 方案：模板保真 + 占位符替换（不重建排版）

1. 把祥哥的 docx **预处理**成 `server/assets/quote-template.docx`：
   - 头部 DATE → `{{DATE}}`
   - TO/FM、ATTN/TEL（嵌套表）→ 占位符
   - 明细表表头保留、第一行数据 → `{{I_CUST}} {{I_SJK}} {{I_SPEC}} {{I_PRICE}} {{I_QTY}} {{I_LT}} {{I_REMARK}}`
   - 明细列宽改成固定布局：客户料号 1350 / SJK 2650 / 规格 2600 / 单价 850 / 包装 1150 / L/T 800 / 备注 1000（twips）
   - logo、公章、条款、字体全部原样保留
2. 运行时（`server/src/utils/quoteDoc.js`）：
   - adm-zip 读模板，字符串替换标量占位符
   - 用正则取出 `{{I_CUST}}` 那一行 `<w:tr>`，按物料条数克隆并替换
   - 文本转义 + `\n → </w:t><w:br/><w:t>`，规格里的换行不会丢
3. Word → PDF：`server/src/utils/docxToPdf.js`，Word COM `ExportAsFixedFormat(pdf, 17)`，串行队列
   - 路径先 `path.resolve`（Word COM 工作目录是 system32，相对路径会找不到文件）

> 没有引入 docx 依赖，避免再次出现 v1.0.239 的「打包漏依赖」问题。

## 后端 `/api/quotes`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/options?customer=` | TO/ATTN/TEL 预填、客户物料、中文简称、历史 |
| POST | `/preview` | 生成 PDF 预览（临时文件，不落盘、不占号） |
| POST | `/generate` | 生成 docx + pdf，落位 `客户管理/<客户>/报价单/` |
| GET | `/list` | 历史（docx/pdf 按 stem 合并） |
| GET | `/download` | 下载/浏览器预览 |
| POST | `/copy` | 复制文件到剪贴板 |
| POST | `/delete` | docx + pdf 一起删 |

命名：`<客户简称>-晶科鑫报价单<YYMMDD>-<序号>.docx`，例 `国润-晶科鑫报价单261028-01.docx`。

## 前端

- `client/src/views/QuoteForm.vue`，路由 `/quote?customer=`
- 客户物料页右上新增「📋 报价单」按钮（`goQuote()`）
- 功能：客户/日期/简称/TO/ATTN/TEL、物料行（可从客户物料带入）、预览、生成、
  结果卡（预览/复制/下载）、历史（预览/复制/删除）

## 测试

- `tests/quote-doc.test.js` 2/2：占位符全替换、两条物料展开、logo+公章保留、空物料报错
- 打包版 1.0.249：`/api/quotes/options` 200；页面选客户 → 选物料 → 生成
  `国润-晶科鑫报价单261028-01.docx` + PDF，历史 1 条
- 生成耗时约 10-13 秒（Word 转 PDF）；前端生成/预览请求超时已调到 180s

## 已知限制

- 条款（结款方式/交期/有效期/环保/税率）目前沿用模板固定文案，未做界面编辑
- 联系方式固定为模板里的晶科鑫信息，未做多主体切换
- 报价单没有「保存默认」按钮；TO/ATTN/TEL 来自客户档案/地图客户
- 表格固定 7 列；物料多时自动续页（模板本身支持）

## 下次可加

- 条款可编辑 + 「保存默认」
- 多主体抬头（不同公司）
- 报价单转订单（引用同一批物料）
