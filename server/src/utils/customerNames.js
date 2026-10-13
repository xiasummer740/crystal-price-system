/**
 * 客户名统一名册（single source of truth）
 *
 * 背景：客户名散在 5 张表里，各页面读的范围不一样，导致「在 A 页面建的客户，
 * B 页面搜不到」。而且 customers 表这个本来该当名册的表，只有 2 个入口在写。
 *
 * 本模块定两条规矩：
 *   ① 写：任何录入客户名的地方，都调 upsertMany() 让它进 customers 表；
 *   ② 读：任何要联想/下拉的地方，都用 suggest() / listAll() ——
 *      查询范围是「customers 名册 ∪ 5 张表的活跃客户名」的并集，
 *      所以即使某个入口忘了写名册，名字照样搜得到（不会因为漏写而丢失）。
 *
 * 为什么读要用并集、而不是直接读 customers 表：
 *   customers 表是"事后补给"的名册，存量数据里本来就不全（实测 110 条，
 *   而系统里实际出现过 121+ 个名字）。并集保证「存量不丢、增量自动同步」。
 */

import { queryAll, execute, executeBatch, saveNow } from '../db.js'

/** 客户名归一：去首尾空白、压掉内部连续空白。返回空串表示不是有效名字。 */
export function normalizeName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim()
}

/** 把一条名字写进名册（已存在则不动，不覆盖 source） */
export function upsertOne(name, source = 'manual') {
  const n = normalizeName(name)
  if (!n) return { inserted: false, name: '' }
  const before = queryAll('SELECT id FROM customers WHERE name = ?', [n]).length
  execute('INSERT OR IGNORE INTO customers (name, source) VALUES (?, ?)', [n, source])
  return { inserted: before === 0, name: n }
}

/** 批量写名册（去重、跳过空名）。只在真的有新增时落盘。 */
export function upsertMany(names, source = 'manual') {
  const seen = new Set()
  let inserted = 0
  for (const raw of names || []) {
    const n = normalizeName(raw)
    if (!n || seen.has(n)) continue
    seen.add(n)
    const before = queryAll('SELECT id FROM customers WHERE name = ?', [n]).length
    if (before === 0) {
      executeBatch('INSERT OR IGNORE INTO customers (name, source) VALUES (?, ?)', [n, source])
      inserted++
    }
  }
  if (inserted > 0) saveNow()
  return inserted
}

/**
 * 把 5 张表里已经出现过的客户名全部补进名册（存量回填）。
 * 幂等：重复调用只会补新增的。返回本次新补进去的条数。
 */
export function syncFromAllTables() {
  const collected = []
  const push = (rows, key = 'name') => {
    for (const r of rows) {
      const n = normalizeName(r[key])
      if (n) collected.push(n)
    }
  }
  push(queryAll("SELECT DISTINCT customer AS name FROM notes WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != ''"))
  push(queryAll("SELECT DISTINCT name FROM map_customers WHERE name IS NOT NULL AND name != ''"))
  push(queryAll("SELECT DISTINCT first_inquiry_customer AS name FROM material_prices WHERE is_deleted = 0 AND first_inquiry_customer IS NOT NULL AND first_inquiry_customer != ''"))
  push(queryAll("SELECT DISTINCT customer AS name FROM customer_materials WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != ''"))
  return upsertMany(collected, 'sync')
}

// ===== 读：统一联想 / 列表 =====

// 并集：名册 ∪ 各表活跃客户名。各表计数用于展示与排序。
const UNION_SQL = `
  SELECT name,
         SUM(in_customers)  AS in_customers,
         SUM(material_cnt)  AS material_cnt,
         SUM(quote_cnt)     AS quote_cnt,
         SUM(note_cnt)      AS note_cnt,
         SUM(map_cnt)       AS map_cnt
  FROM (
    SELECT name, 1 AS in_customers, 0 AS material_cnt, 0 AS quote_cnt, 0 AS note_cnt, 0 AS map_cnt
      FROM customers WHERE name IS NOT NULL AND name != ''
    UNION ALL
    SELECT customer AS name, 0, COUNT(*), 0, 0, 0 FROM customer_materials
      WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != '' GROUP BY customer
    UNION ALL
    SELECT first_inquiry_customer AS name, 0, 0, COUNT(*), 0, 0 FROM material_prices
      WHERE is_deleted = 0 AND first_inquiry_customer IS NOT NULL AND first_inquiry_customer != '' GROUP BY first_inquiry_customer
    UNION ALL
    SELECT customer AS name, 0, 0, 0, COUNT(*), 0 FROM notes
      WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != '' GROUP BY customer
    UNION ALL
    SELECT name, 0, 0, 0, 0, COUNT(*) FROM map_customers
      WHERE name IS NOT NULL AND name != '' GROUP BY name
  )
`

const ORDER_AND_LIMIT = `
  ORDER BY (material_cnt + quote_cnt + note_cnt + map_cnt) DESC, name ASC
  LIMIT ?
`

function shape(r) {
  const material = Number(r.material_cnt) || 0
  const quote = Number(r.quote_cnt) || 0
  const note = Number(r.note_cnt) || 0
  const map = Number(r.map_cnt) || 0
  return { name: r.name, material_count: material, quote_count: quote, note_count: note, map_count: map, total_count: material + quote + note + map }
}

/** 联想：按关键词模糊匹配，返回带各来源计数的候选 */
export function resolveSuggest(keyword, limit = 20) {
  const kw = normalizeName(keyword)
  if (!kw) return []
  return queryAll(
    `${UNION_SQL} WHERE name LIKE ? GROUP BY name ${ORDER_AND_LIMIT}`,
    [`%${kw}%`, Math.max(1, Math.min(50, Number(limit) || 20))]
  ).map(shape)
}

/**
 * 联想（含"按物料型号反查所属客户"）：
 * 输入客户名 → 匹配客户；输入物料型号/编码 → 返回该物料所属客户。
 * 这是从 materials.js 原来那个 5 表联邦查询收敛过来的。
 */
export function resolveSuggestWithMaterialMatch(keyword, limit = 20) {
  const kw = normalizeName(keyword)
  if (!kw) return []
  const like = `%${kw}%`
  return queryAll(
    `${UNION_SQL} WHERE name LIKE ? OR name IN (
        SELECT customer FROM customer_materials
          WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != ''
            AND (customer_code LIKE ? OR jkx_code LIKE ? OR material_code LIKE ? OR material_name LIKE ? OR customer_desc LIKE ?)
      ) OR name IN (
        SELECT first_inquiry_customer FROM material_prices
          WHERE is_deleted = 0 AND first_inquiry_customer IS NOT NULL AND first_inquiry_customer != ''
            AND (material_code LIKE ? OR material_spec LIKE ? OR material_name LIKE ?)
      )
      GROUP BY name ${ORDER_AND_LIMIT}`,
    [like, like, like, like, like, like, like, like, like, Math.max(1, Math.min(50, Number(limit) || 20))]
  ).map(shape)
}

/** 全量列表（客户下拉用）。limit 给大一点，保证并集不被截断。 */
export function listAll(limit = 2000) {
  return queryAll(`${UNION_SQL} GROUP BY name ${ORDER_AND_LIMIT}`, [Math.max(1, Math.min(5000, Number(limit) || 2000))]).map(shape)
}
