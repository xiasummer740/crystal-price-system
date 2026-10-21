/**
 * 表单联想候选（自动补全）——统一后端
 *
 * 目的：录入页别再一个个手打。凡是「以前录过、以后大概率还会录」的字段，
 * 都把历史值汇总成候选列表给前端做下拉。
 *
 * 两条设计原则（改动时别丢）：
 *   1. **同一个业务字段在不同表里列名不同**（工厂：material_prices.factory_code、
 *      customer_materials.factory），所以来源写成 [表, 列] 对，不做同名列的假设。
 *   2. **表名/列名一律来自本文件的常量**，接口传进来的 field/scope 先对照白名单，
 *      绝不把请求参数拼进 SQL（下面所有 ${} 插值都只可能是这里写死的标识符）。
 */
import { queryAll } from '../db.js'

/** 物料参数/编码的公共字段（codeCandidates 合并时按这个顺序取第一个非空值） */
const META_FIELDS = ['name', 'spec', 'brand', 'dimension', 'pin_count', 'frequency', 'load_cap', 'voltage', 'mode', 'freq_tol', 'factory_code']

/**
 * scope → 字段 → 来源表列。
 * 键名与前端表单字段名一一对应；新增页面时在这里加一条即可（前后端都不用改别的）。
 */
const FIELD_SOURCES = {
  // 样品登记
  samples: {
    material_code: [['material_prices', 'material_code'], ['material_samples', 'material_code']],
    material_name: [['material_prices', 'material_name'], ['material_samples', 'material_name']],
    material_spec: [['material_prices', 'material_spec'], ['material_samples', 'material_spec']],
    brand: [['material_prices', 'brand'], ['material_samples', 'brand']],
    dimension: [['material_prices', 'dimension'], ['material_samples', 'dimension']],
    pin_count: [['material_prices', 'pin_count'], ['material_samples', 'pin_count']],
    frequency: [['material_prices', 'frequency'], ['material_samples', 'frequency']],
    load_cap: [['material_prices', 'load_cap'], ['material_samples', 'load_cap']],
    voltage: [['material_prices', 'voltage'], ['material_samples', 'voltage']],
    mode: [['material_prices', 'mode'], ['material_samples', 'mode']],
    freq_tol: [['material_prices', 'freq_tol'], ['material_samples', 'freq_tol']],
    temperature: [['material_prices', 'temperature'], ['material_samples', 'temperature']],
    factory_code: [['material_prices', 'factory_code'], ['material_samples', 'factory_code']]
  },
  // 客户物料
  materials: {
    material_code: [['material_prices', 'material_code'], ['customer_materials', 'material_code'], ['customer_materials', 'jkx_code']],
    jkx_code: [['customer_materials', 'jkx_code'], ['material_prices', 'material_code'], ['material_samples', 'material_code']],
    material_name: [['customer_materials', 'material_name'], ['material_prices', 'material_name']],
    factory: [['customer_materials', 'factory'], ['material_prices', 'factory_code'], ['material_samples', 'factory_code']],
    customer_code: [['customer_materials', 'customer_code']]
  }
}

/** 每个 scope 的物料档案从哪里拼（已删的不要） */
const CODE_SOURCES = {
  samples: [
    {
      sql: `SELECT material_code AS code, material_name AS name, material_spec AS spec, brand, dimension,
                   pin_count, frequency, load_cap, voltage, mode, freq_tol, factory_code,
                   COUNT(*) AS count, MAX(created_at) AS last_at
            FROM material_prices WHERE is_deleted = 0 AND material_code IS NOT NULL AND material_code != ''
            GROUP BY material_code`
    },
    {
      sql: `SELECT material_code AS code, material_name AS name, material_spec AS spec, brand, dimension,
                   pin_count, frequency, load_cap, voltage, mode, freq_tol, factory_code,
                   COUNT(*) AS count, MAX(created_at) AS last_at
            FROM material_samples WHERE is_deleted = 0 AND material_code IS NOT NULL AND material_code != ''
            GROUP BY material_code`
    }
  ],
  materials: [
    {
      sql: `SELECT material_code AS code, material_name AS name, material_spec AS spec, brand, dimension,
                   pin_count, frequency, load_cap, voltage, mode, freq_tol, factory_code,
                   COUNT(*) AS count, MAX(created_at) AS last_at
            FROM material_prices WHERE is_deleted = 0 AND material_code IS NOT NULL AND material_code != ''
            GROUP BY material_code`
    },
    {
      sql: `SELECT jkx_code AS code, material_name AS name, factory AS factory_code,
                   NULL AS spec, NULL AS brand, NULL AS dimension, NULL AS pin_count, NULL AS frequency,
                   NULL AS load_cap, NULL AS voltage, NULL AS mode, NULL AS freq_tol,
                   COUNT(*) AS count, MAX(created_at) AS last_at
            FROM customer_materials WHERE is_deleted = 0 AND jkx_code IS NOT NULL AND jkx_code != ''
            GROUP BY jkx_code`
    },
    {
      sql: `SELECT material_code AS code, material_name AS name, factory AS factory_code,
                   NULL AS spec, NULL AS brand, NULL AS dimension, NULL AS pin_count, NULL AS frequency,
                   NULL AS load_cap, NULL AS voltage, NULL AS mode, NULL AS freq_tol,
                   COUNT(*) AS count, MAX(created_at) AS last_at
            FROM customer_materials WHERE is_deleted = 0 AND material_code IS NOT NULL AND material_code != ''
            GROUP BY material_code`
    }
  ]
}

/** 允许的 scope（白名单，同时导出给路由做校验） */
export const SCOPES = Object.keys(FIELD_SOURCES)

/** 某 scope 支持的所有字段名（白名单） */
export function scopeFields(scope) {
  return Object.keys(FIELD_SOURCES[scope] || {})
}

/** LIKE 特殊字符转义：用户输入里的 % _ \ 都当普通字符 */
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, m => '\\' + m)
}

function toLimit(limit, fallback = 30, max = 500) {
  const n = Number(limit)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), max)
}

/**
 * 单个字段的历史值（按使用次数倒序）。
 *
 * @returns {Array<{value: string, count: number}>}
 */
export function fieldValues(scope, field, { keyword = '', limit = 30, customer = '' } = {}) {
  const sources = FIELD_SOURCES[scope]?.[field]
  if (!sources) return []
  const kw = `%${escapeLike(keyword)}%`
  const lim = toLimit(limit, 30, 500)

  // 客户物料编码是「每个客户自己的一套」：带了 customer 就只在这个客户里联想，
  // 否则会把 A 客户的料号推荐给 B 客户，越帮越乱。
  if (field === 'customer_code' && customer) {
    return queryAll(
      `SELECT TRIM(customer_code) AS value, COUNT(*) AS count
       FROM customer_materials
       WHERE is_deleted = 0 AND customer = ? AND customer_code IS NOT NULL AND TRIM(customer_code) != ''
         AND TRIM(customer_code) LIKE ? ESCAPE '\\'
       GROUP BY TRIM(customer_code) ORDER BY count DESC, value LIMIT ?`,
      [customer, kw, lim]
    )
  }

  // TRIM：真实数据里存在「前后带空格」的值（手打/Excel 粘贴留下的）。
  // 不修数据，但候选里不该出现「看起来一样、选中却多一个空格」的两条。
  const parts = sources.map(([table, column]) =>
    `SELECT TRIM(${column}) AS value, COUNT(*) AS c FROM ${table}
     WHERE is_deleted = 0 AND ${column} IS NOT NULL AND TRIM(${column}) != ''
     GROUP BY TRIM(${column})`
  )
  return queryAll(
    `SELECT value, SUM(c) AS count FROM (${parts.join(' UNION ALL ')}) t
     WHERE value LIKE ? ESCAPE '\\'
     GROUP BY value ORDER BY count DESC, value LIMIT ?`,
    [kw, lim]
  )
}

/**
 * 物料档案候选：带名称/规格/技术参数，前端选中料号时可直接回填整行。
 *
 * 合并策略：同一料号在多张表里出现时，次数相加、元数据取**第一个非空值**
 * （空值不覆盖已有值，否则 customer_materials 里只填了名字的行会把价格表里的规格冲掉）。
 */
export function codeCandidates(scope, { keyword = '', limit = 400 } = {}) {
  const sources = CODE_SOURCES[scope]
  if (!sources) return []
  const map = new Map()
  const clean = v => (typeof v === 'string' ? v.trim() : (v ?? ''))
  for (const src of sources) {
    let rows = []
    try { rows = queryAll(src.sql) } catch { rows = [] }
    for (const row of rows) {
      const code = String(row.code || '').trim()
      if (!code) continue
      const prev = map.get(code)
      if (!prev) {
        const item = { code, count: Number(row.count) || 0, last_at: row.last_at || '' }
        for (const f of META_FIELDS) item[f] = clean(row[f])
        map.set(code, item)
        continue
      }
      prev.count += Number(row.count) || 0
      for (const f of META_FIELDS) {
        if (!prev[f] && clean(row[f])) prev[f] = clean(row[f])
      }
      if ((row.last_at || '') > (prev.last_at || '')) prev.last_at = row.last_at
    }
  }

  // 这颗料还被哪些客户用过（v1.0.235）：客户物料表里同一个 jkx_code / material_code 的客户名。
  // 用途：在「物料编码」联想下拉里直接看出「这颗料是不是别家也在用」，不用再切页面查。
  // 数据量很小（客户物料几百条），一次查完在内存里按料号聚合即可。
  try {
    const rows = queryAll(`SELECT customer, jkx_code, material_code FROM customer_materials
                           WHERE is_deleted = 0 AND customer IS NOT NULL AND customer != ''`)
    const byCode = new Map()
    for (const r of rows) {
      const customer = String(r.customer || '').trim()
      if (!customer) continue
      for (const rawCode of [r.jkx_code, r.material_code]) {
        const code = String(rawCode || '').trim()
        if (!code) continue
        if (!byCode.has(code)) byCode.set(code, new Set())
        byCode.get(code).add(customer)
      }
    }
    for (const item of map.values()) {
      const set = byCode.get(item.code)
      item.customers = set ? [...set].sort((a, b) => a.localeCompare(b, 'zh')) : []
      item.customer_count = item.customers.length
    }
  } catch {
    for (const item of map.values()) { item.customers = []; item.customer_count = 0 }
  }

  const kw = String(keyword || '').trim().toLowerCase()
  let list = [...map.values()]
  if (kw) list = list.filter(it => it.code.toLowerCase().includes(kw) || String(it.name || '').toLowerCase().includes(kw))
  list.sort((a, b) => b.count - a.count || (b.last_at || '').localeCompare(a.last_at || '') || a.code.localeCompare(b.code))
  return list.slice(0, toLimit(limit, 400, 1000))
}

/**
 * 整张表单的候选：字段值 + 物料档案，一次请求带回来（前端本地过滤，敲字零延迟）。
 */
export function formSuggestions(scope, { keyword = '', limit = 30, customer = '' } = {}) {
  const fields = {}
  for (const field of scopeFields(scope)) {
    fields[field] = fieldValues(scope, field, { keyword, limit, customer })
  }
  return { fields, codes: codeCandidates(scope, { keyword }) }
}
