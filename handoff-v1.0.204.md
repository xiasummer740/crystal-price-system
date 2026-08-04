# 接力文档 v1.0.204

> 修复产品参数「空编码」批量刷写 bug，最新 tag: v1.0.204

## 当前状态

**v1.0.204**，已发布 GitHub Release（exe + blockmap + latest.yml 三件套）。工作区干净。

## 问题

祥哥：给一条**无编码**记录补充编码+详细参数后"全乱了"，其他无编码的不同物料全聚合到一个编码下。

## 根因

`server/src/routes/prices.js` `batch-update-specs`（✎产品参数）：
- 源记录有编码 → `material_code = ?` 按编码匹配（正确）
- 源记录**无编码** → `(material_code IS NULL OR material_code = '')` 匹配所有空编码记录，把表单编码+全部技术参数**批量刷写到这些不同物料上**

## 修复

```js
if (mc) { conditions.push('material_code = ?'); params.push(mc) }
else if (source.id) { conditions.push('id = ?'); params.push(source.id) }  // 只更新当前记录
else { conditions.push('1 = 0') }
```

已验证：无编码源只影响 1 行，其他空编码记录保持原样。

## 数据恢复

- batch-update-specs **不触发** Excel 备份 → 改写前的最近备份还在
- 祥哥在**另一台电脑 D 盘**操作，可到 `Excel备份/报价记录-自动备份-*.xlsx` 找改写前备份还原
- 本机 G:/F 盘库是遗留/测试数据，与祥哥真实数据无关

## 踩坑

- 祥哥真实数据在**另一台电脑 D 盘**，本机数据目录排查浪费了大量时间 → **排查数据问题先问祥哥在哪台电脑**
- 发版必须传 exe + **blockmap** + latest.yml 三件套（差分更新依赖）

相关记忆：[[batch-update-specs-empty-code-bug]] [[release-blockmap-pitfall]]
