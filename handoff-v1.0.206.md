# 接力文档 v1.0.206

> 接力开发 — 新增报价防重复/防参数不一致拦截，最新 tag: v1.0.206

## 当前状态

**v1.0.206**，GitHub Release 三件套齐全（exe + blockmap + latest.yml）。工作区干净，全部已推送。

## 本会话已交付

| 内容 | 说明 |
|------|------|
| 🛡️ **新增防重复拦截** | `POST /api/prices` 新增时检查：①同编码但技术参数不一致 → 400 拦截，提示去「✎ 产品参数」统一修改；②记录完全相同（编码+参数+工厂+价格+报价人都一样）→ 400 拦截，提示勿重复添加 |
| ✅ **不破坏多工厂报价** | 同编码、参数一致、仅工厂/价格不同 → 正常新增，列表整合成一条（分组视图显示「2厂 N条」） |
| 🧪 **5 个后端测试** | tests/api-prices.test.js 新增防冲突 describe，覆盖首条新增/同码异厂允许/参数不一致拦截/完全重复拦截/空编码重复拦截 |

## 需求确认记录（祥哥拍板）

1. 检查范围：**仅拦截完全重复**（不是"同编码就拦"）
2. 补充确认：**参数不一致就拦截**（输入已存在编码但技术参数不一致 → 不允许新增，提示去产品参数弹窗改）
3. 祥哥强调：「不同工厂+同一编码要整合到一条里面」「同一个编码不能有两条信息」——即一个编码永远只对应一条产品信息，多工厂报价是这条产品里的多条报价

## 关键技术决策

- **PRODUCT_PARAMS** = 产品身份字段 `['material_name','material_spec','category','brand','dimension','pin_count','frequency','load_cap','voltage','mode','freq_tol','temperature']`（与分组视图 matchCols 一致，**不含 spec_document 附件**）
- **FULL_DUP_FIELDS** = 前端列表去重 key 一致（`price.js loadList` 同一字段集合，20 个字段），保证"会被显示合并的记录不允许创建"
- **canonical() 默认值规范化**：currency 默认 'CNY'（与 INSERT `b.currency||'CNY'` 一致），否则空编码记录存的是 'CNY'、检查比的是 ''，重复检测漏判（测试抓到后修复）
- **JS 中比较而非 SQL**：先按编码缩小范围（索引列），剩余字段在 JS 用 String 规范化比较，避免 SQLite 数值/文本类型比较陷阱（如 `0 = ''` 判 true）
- **空编码只防完全重复**：无编码时不校验参数一致性（避免误拦无编码记录），仅拦截完全相同的误录入

## 验证证据

- 后端 `node --test tests/*.test.js` → **47/47 通过**（含新增 5 个）
- 浏览器实机验证 6 项全过（截图 `e2e-param-conflict-blocked.png`、`e2e-final-integrated.png`）：
  1. 新增唯一编码 → 成功
  2. 同编码改负载(20pF) → 拦截，toast「技术参数不一致」
  3. 同编码参数一致换工厂 → 成功，列表整合「2厂 2条」
  4. 完全相同的记录 → 拦截，toast「完全相同的记录」
  5. 另存为新记录（不变更）→ 拦截
  6. 另存为新记录（改价格）→ 成功，整合「2厂 3条」

## 待办/未决策（上轮遗留 + 本轮）

- [ ] **导入价格日志**：导入自动生成 3 条"空→值"日志，祥哥未答复是否改（①不生成 ②标记「📥导入初始价」）
- [ ] 祥哥 D 盘数据恢复是否完成、有无重复记录需确认（v1.0.204 批量改写事故的善后）
- [ ] 客户物料看板视图（祥哥犹豫，先看效果）

## 关键文件

| 文件 | 说明 |
|------|------|
| `server/src/routes/prices.js` | `findCreateConflict` + POST / 拦截 |
| `tests/api-prices.test.js` | 新增防冲突测试 describe |
| `e2e-param-conflict-blocked.png` / `e2e-final-integrated.png` | 浏览器验证截图 |

## 踩坑

- **SQLite 类型比较陷阱**：`0 = ''` 在 SQLite 里判 true（'' 转数值为 0），价格字段不能用 SQL 直接比 → JS 规范化比较
- **currency 默认值**：INSERT 默认 'CNY'，重复检查必须用相同默认，否则漏判
- **发版必须传 3 件套**：exe + blockmap + latest.yml（blockmap 缺则差分更新失效）——见 [[release-blockmap-pitfall]]
- **release.ps1 假失败 bug**：`$ErrorActionPreference='Stop'` + node stderr → NativeCommandError。手动发版：bump→npm run package→commit→tag→gh release create（3件套）

相关记忆：[[batch-update-specs-empty-code-bug]] [[release-after-change]] [[browser-verify-rule]] [[verification-mandatory]]
