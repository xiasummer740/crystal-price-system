/**
 * 客户名册管理：删除 / 合并（把简写并到全名）
 *
 * 为什么需要这组接口：客户名散在 4 张来源表 + 1 张名册，而页面显示的是**并集**
 * （名册 ∪ 客户物料 ∪ 报价的首次询价客户 ∪ 记事 ∪ 地图）。
 * 所以「只从名册删掉一个名字」根本没用 —— 源头还写着它，页面照样显示，
 * 下次启动 `syncFromAllTables()` 还会把它补回名册。
 * 2026-10-14 祥哥就是这么踩到的：名册里冒出「国润」「图科、」这类手打简写，
 * 他在界面上**找不到任何地方能删**（当时确实没有这个功能，本文件补上）。
 *
 * 三条规则（都是为了「删了就是真的没了」）：
 *   ① **删除**：只在**任何来源表都没引用**时才允许。有引用就 409 + 列出是哪张表几条，
 *      并提示两条正路（用「合并到全名」，或去源头把那条记录改掉）。
 *   ② **合并**：把来源表里 from 的引用**全部**改成 to（连回收站里的一起改 ——
 *      否则从回收站恢复一条记录，简写又冒出来），再删名册里的 from、确保 to 在名册里。
 *   ③ 冲突：`map_customers.name` 有 UNIQUE 约束。若 from 和 to 在地图客户里都存在，
 *      没法直接改名 ⇒ **整单拒绝**并说明（不做「部分成功」，那会留下更难查的中间态）。
 *
 * 事务说明：这里**不用** `BEGIN/COMMIT`。本项目 db.js 的写操作走 300ms 防抖落盘，
 * 而 sql.js 是「整库导出」——事务进行到一半时正好落盘，磁盘上就会留下一份
 * 「改了一半」的库。改用**先预检、再执行**：预检把所有冲突与条数都算清楚，
 * 执行阶段只剩固定几条 UPDATE/DELETE，实际不会中途失败。
 */
import { Router } from 'express'
import { queryAll, queryOne, executeBatch, saveNow } from '../db.js'
import { normalizeName, listAll } from '../utils/customerNames.js'
// 客户账期/对账付款资料（祥哥 2026-10-15）：存在 customers 表上，见 utils/customerProfile.js 顶部说明
import { readProfile, saveProfile, hasProfile, computeSchedule, PAYMENT_TERM_PRESETS } from '../utils/customerProfile.js'

const router = Router()

// 来源表清单。改名/删除都要同时处理这几处 —— 漏一处，名字就会从那个入口继续冒出来。
// ⚠️ 改这里的 every row 都要连同 handleMerge/refCounts 一起看：故意**不带 is_deleted 过滤**，
//    连回收站里的引用一起改/一起算，避免「恢复一条回收站记录 ⇒ 简写复活」。
const SOURCES = [
  { key: 'quotes', table: 'material_prices', column: 'first_inquiry_customer', label: '报价记录' },
  { key: 'materials', table: 'customer_materials', column: 'customer', label: '客户物料' },
  { key: 'notes', table: 'notes', column: 'customer', label: '记事' }
]
const MAP_TABLE = 'map_customers'

/** 各来源表里这个名字被引用了几条（含回收站） */
function refCounts(name) {
  const out = {}
  for (const s of SOURCES) {
    out[s.key] = queryOne(`SELECT COUNT(*) AS c FROM ${s.table} WHERE ${s.column} = ?`, [name])?.c || 0
  }
  out.map = queryOne(`SELECT COUNT(*) AS c FROM ${MAP_TABLE} WHERE name = ?`, [name])?.c || 0
  return out
}

/** 冲突检查：地图客户的 name 是 UNIQUE，两边都有就没法改名 */
function findConflicts(from, to) {
  const conflicts = []
  const fromInMap = (queryOne(`SELECT COUNT(*) AS c FROM ${MAP_TABLE} WHERE name = ?`, [from])?.c || 0) > 0
  const toInMap = (queryOne(`SELECT COUNT(*) AS c FROM ${MAP_TABLE} WHERE name = ?`, [to])?.c || 0) > 0
  if (fromInMap && toInMap) {
    conflicts.push({
      table: MAP_TABLE,
      label: '地图客户',
      reason: `「${from}」和「${to}」在地图客户里都存在，而客户名在那张表上是唯一约束，改名会撞车。请先在地图页把其中一个改掉或删掉。`
    })
  }
  return conflicts
}

function buildPlan(from, to) {
  const counts = refCounts(from)
  const tables = SOURCES.map(s => ({ key: s.key, label: s.label, count: counts[s.key] }))
  tables.push({ key: 'map', label: '地图客户', count: counts.map })
  return {
    from,
    to,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    tables,
    conflicts: findConflicts(from, to)
  }
}

function validate(req, res) {
  const from = normalizeName(req.body?.from)
  const to = normalizeName(req.body?.to)
  if (!from || !to) { res.status(400).json({ code: 1, msg: 'from / to 都不能为空' }); return null }
  if (from === to) { res.status(400).json({ code: 1, msg: 'from 和 to 是同一个名字，不用合并' }); return null }
  return { from, to }
}

// ===== ① 名册列表（管理页用）：**按并集列**，每条带各来源引用计数 =====
// 为什么用并集而不是只列 customers 表：用户看到的是并集，管理页要是只列名册，
// 就会出现「页面上有个名字，管理页里找不到」的死角（比如名字只在报价记录里、
// 还没被回填进名册）。并集里每条再补上名册侧的 source/created_at，一眼看出它是怎么进来的。
router.get('/manage', (req, res) => {
  const keyword = normalizeName(req.query.keyword || '')
  const union = listAll(5000)
  const regRows = queryAll(`SELECT name, source, created_at, payment_terms, statement_day, payment_days, next_statement_date, pay_remark
                              FROM customers`)
  const regMap = new Map(regRows.map(r => [r.name, r]))

  const data = union
    .filter(r => !keyword || r.name.includes(keyword))
    .map(r => {
      const meta = regMap.get(r.name)
      // refs 用**含回收站**的口径：删除守卫就是这么判的，两边口径一致才不会
      // 「界面说能删、点了却被拒」
      const refs = refCounts(r.name)
      const refTotal = Object.values(refs).reduce((a, b) => a + b, 0)
      return {
        name: r.name,
        in_registry: !!meta,
        source: meta?.source || '',
        created_at: meta?.created_at || '',
        refs,
        ref_total: refTotal,
        deletable: !!meta && refTotal === 0,
        // 账期资料（名册管理里显示一列，方便逐户巡检）
        payment_terms: meta?.payment_terms || '',
        pay_remark: meta?.pay_remark || '',
        has_profile: hasProfile(r.name),
        // 只有填过账期的才算日程，免得给 140 个客户都算一遍没意义的日期
        schedule: hasProfile(r.name) ? computeSchedule(meta || {}) : null
      }
    })
    // 排序：可疑的排前面（短名、名字里带标点），其余按引用多的排 —— 方便一眼看到该清的
    .sort((a, b) => {
      const score = (x) => (x.name.length <= 5 ? 2 : 0) + (/[、，,。;；]/.test(x.name) ? 1 : 0)
      const d = score(b) - score(a)
      if (d) return d
      if (b.ref_total !== a.ref_total) return b.ref_total - a.ref_total
      return a.name.localeCompare(b.name, 'zh')
    })

  res.json({ code: 0, data, registry_total: regRows.length, union_total: union.length })
})

// ===== ② 合并前预览：会动哪些表、各几条、有没有冲突 =====
router.post('/merge-preview', (req, res) => {
  const v = validate(req, res)
  if (!v) return
  res.json({ code: 0, data: buildPlan(v.from, v.to) })
})

// ===== ③ 合并：把 from 的所有引用改成 to =====
router.post('/merge', (req, res) => {
  const v = validate(req, res)
  if (!v) return
  const { from, to } = v
  const plan = buildPlan(from, to)
  if (plan.conflicts.length) return res.status(409).json({ code: 1, msg: plan.conflicts[0].reason, data: plan })

  // 执行（预检已过，这里只剩固定几条语句）
  const changed = {}
  for (const s of SOURCES) {
    executeBatch(`UPDATE ${s.table} SET ${s.column} = ? WHERE ${s.column} = ?`, [to, from])
    changed[s.key] = queryOne(`SELECT COUNT(*) AS c FROM ${s.table} WHERE ${s.column} = ?`, [to])?.c || 0
  }
  executeBatch(`UPDATE ${MAP_TABLE} SET name = ? WHERE name = ?`, [to, from])
  changed.map = queryOne(`SELECT COUNT(*) AS c FROM ${MAP_TABLE} WHERE name = ?`, [to])?.c || 0
  // 名册：确保 to 在册、from 出册
  executeBatch('INSERT OR IGNORE INTO customers (name, source) VALUES (?, ?)', [to, 'merge'])
  // 账期资料也要跟着走，否则「把简写并到全名」之后账期就找不到了。
  // 策略：**目标行已填过就保留目标的**（判定它是更权威的那条），只有目标为空时才从源行搬过来。
  try {
    if (hasProfile(from) && !hasProfile(to)) {
      executeBatch(
        `UPDATE customers SET payment_terms = (SELECT payment_terms FROM customers WHERE name = ?),
             statement_day = (SELECT statement_day FROM customers WHERE name = ?),
             payment_days = (SELECT payment_days FROM customers WHERE name = ?),
             next_statement_date = (SELECT next_statement_date FROM customers WHERE name = ?),
             pay_remark = (SELECT pay_remark FROM customers WHERE name = ?),
             profile_updated_at = (SELECT profile_updated_at FROM customers WHERE name = ?)
           WHERE name = ?`,
        [from, from, from, from, from, from, to]
      )
      changed.profile = 'moved'      // 账期资料已从 from 搬到 to
    } else if (hasProfile(from)) {
      changed.profile = 'kept-target' // 两边都填过：保留目标行的
    }
  } catch (e) { console.warn('[customers] 合并时搬迁账期资料失败（不影响合并）:', e.message) }
  // 订单默认资料（简称 / 乙方 / 六~九条款）同样跟着走：目标行没存过才从源行搬
  try {
    const src = queryOne('SELECT short_name, order_profile FROM customers WHERE name = ?', [from])
    const dst = queryOne('SELECT short_name, order_profile FROM customers WHERE name = ?', [to])
    const srcHas = !!(src && (String(src.short_name || '').trim() || String(src.order_profile || '').trim()))
    const dstHas = !!(dst && (String(dst.short_name || '').trim() || String(dst.order_profile || '').trim()))
    if (srcHas && !dstHas) {
      executeBatch(
        'UPDATE customers SET short_name = ?, order_profile = ? WHERE name = ?',
        [src.short_name || '', src.order_profile || '', to]
      )
      changed.order_profile = 'moved'
    } else if (srcHas) {
      changed.order_profile = 'kept-target'
    }
  } catch (e) { console.warn('[customers] 合并时搬迁订单资料失败（不影响合并）:', e.message) }
  executeBatch('DELETE FROM customers WHERE name = ?', [from])
  saveNow()
  res.json({ code: 0, msg: `已把「${from}」合并到「${to}」`, data: { from, to, merged: plan.total, tables: plan.tables } })
})

// ===== ④ 删除名册条目（仅当任何来源表都没引用）=====
router.delete('/:name', (req, res) => {
  const name = normalizeName(decodeURIComponent(req.params.name || ''))
  if (!name) return res.status(400).json({ code: 1, msg: '名字不能为空' })
  const refs = refCounts(name)
  const used = Object.entries(refs).filter(([, v]) => v > 0)
  if (used.length) {
    const labelOf = (k) => (k === 'map' ? '地图客户' : (SOURCES.find(s => s.key === k)?.label || k))
    const detail = used.map(([k, v]) => `${labelOf(k)} ${v} 条`).join('、')
    return res.status(409).json({
      code: 1,
      msg: `「${name}」还在被引用（${detail}），不能只从名册删 —— 源头还写着它，页面就还会显示，下次启动也会被自动补回来。请改用「合并到正确全名」，或去上面那几处把记录里的客户名改掉。`,
      data: { name, refs }
    })
  }
  // 填过账期/备注的也不许删：那些资料只挂在名册这一行上，删了就真没了（不像物料还能从回收站找）
  if (hasProfile(name)) {
    return res.status(409).json({
      code: 1,
      msg: `「${name}」上填过账期或备注资料，从名册删会把它们一起删掉。若确实要删，请先把账期资料清空（在「客户物料」页选中该客户 → 点页头的账期条修改），再回来删。`,
      data: { name, has_profile: true }
    })
  }
  // 存过订单默认资料（乙方/条款/简称）的同样不许删 —— 订单页的「保存默认」就存在这一行上
  try {
    const o = queryOne('SELECT short_name, order_profile FROM customers WHERE name = ?', [name])
    if (o && (String(o.short_name || '').trim() || String(o.order_profile || '').trim())) {
      return res.status(409).json({
        code: 1,
        msg: `「${name}」上存过订单默认资料（客户简称/乙方信息/条款），从名册删会一起删掉。若确实要删，请重新生成订单时清空这些资料再删。`,
        data: { name, has_order_profile: true }
      })
    }
  } catch { /* 查不到就按没存过处理 */ }
  const r = executeBatch('DELETE FROM customers WHERE name = ?', [name])
  if (!r.changes) return res.status(404).json({ code: 1, msg: `名册里没有「${name}」` })
  saveNow()
  res.json({ code: 0, msg: `已从名册删除「${name}」` })
})

// ===== ⑤ 顺带暴露统一列表（前端画「并集」用的同一份数据）=====
router.get('/union-list', (req, res) => {
  res.json({ code: 0, data: listAll(req.query.limit) })
})

// ===== ⑥ 客户账期 / 对账付款资料（祥哥 2026-10-15）=====
// ⚠️ 这两条必须注册在 `/:name` 之前 —— 否则 DELETE/GET 的 `/:name` 会先把 'profile' 吃掉
//    （materials.js 的 /stale、/monthly 踩过同一个坑，见那里的注释）。
router.get('/profile', (req, res) => {
  const name = normalizeName(req.query.name || '')
  if (!name) return res.status(400).json({ code: 1, msg: '缺少客户名' })
  res.json({ code: 0, data: { ...readProfile(name), presets: PAYMENT_TERM_PRESETS } })
})

router.post('/profile', (req, res) => {
  const name = normalizeName(req.body?.name || '')
  if (!name) return res.status(400).json({ code: 1, msg: '缺少客户名' })
  const r = saveProfile(name, req.body || {})
  if (r.error) return res.status(400).json({ code: 1, msg: r.error })
  res.json({ code: 0, data: { ...r.data, presets: PAYMENT_TERM_PRESETS }, msg: '已保存' })
})

export default router
