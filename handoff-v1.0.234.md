# 接力文档 v1.0.234

> 起因：祥哥在「新增记事 → 关联物料」截图里圈了数量后面的「单位」输入框：
> 「截图内红框的单位可以固定为 PCS」。
> 本版只做这一件事：**单位不再手打，固定 PCS**。

## 一句话

关联物料那一行的单位从「可编辑输入框」改成**固定 PCS 的灰底块**，新建行默认 PCS、保存时也写 PCS；
详情页显示成「6000 PCS」；旧数据里的其它单位不强制迁移。

## 一、改动

| 位置 | 改动 |
|---|---|
| `MaterialRefsPicker.vue` | `<input class="mrp-unit" v-model="row.unit">` → 不可编辑的 `PCS` 灰底块（`mrp-unit-fixed`） |
| 同上（新建/回填） | `addRow()`、`fromModel()` 的单位统一置 `'PCS'` |
| 同上（保存） | `sync()` 输出 `unit: 'PCS'`（不再读输入框） |
| `NoteDetail.vue` | 关联物料数量显示 `{{ quantity }} {{ unit || 'PCS' }}`（空单位兜底 PCS） |
| `server/src/routes/notes.js` | `normalizeRefs` 里空 unit 默认 `'PCS'`；**显式传了别的单位仍原样保留**（不擅自改历史数据） |

## 二、验证

- 后端 **185 pass**（新增 `tests/notes-refs-unit.test.js` 2 条：空单位默认 PCS、显式旧单位原样保留）。
- 前端 **12 pass**。
- 真机（headless Chrome + 沙箱 3399）**12/12**：
  - 选客户 → 添加物料 → 选物料 → 数量 6000
  - 单位位置显示 `PCS`，且**不是 input**；点它也不会变成可编辑
  - 保存后接口 `material_refs[0].unit === 'PCS'`、`quantity === '6000'`
  - 截图：`notes-unit-pcs.png`
- 打包版（win-unpacked/asar）**5/5**：用 API 建一条带关联物料的记事（故意不传 unit），
  在打包版编辑页打开它 —— `.mrp-unit` 文本为 **PCS**、`input.mrp-unit` 数量为 **0**、数量回填 100 正常
  （asar 里 UI 真正生效，不是开发版特有）。

## 三、遗留 / 下次

- 旧记事里已经存成「颗/只/…」的关联物料：详情仍显示原单位；**重新编辑保存后**会统一成 PCS。
  若祥哥要求连历史一起改，需要单独写一次数据迁移（当前没做，避免擅自改历史）。
