/**
 * 物料进展时间线 —— 把**已经存在**的数据聚合成一条按时间排的流水。
 *
 * 祥哥 2026-10-14 的需求：「之前最早的记录是报价或送样，后面发了规格书、价格更新、下散单、
 * 下批量，改完只看到最后的结果，完全不知道之前的进度 —— 不知道什么时候开始报价的、
 * 什么时候送样的、什么时候给的规格书，之前的报价变化是什么样也不知道。」
 *
 * 本模块**只读**，把四处拼起来（按时间倒序）：
 *   ① material_events —— 自本次起记录的进展流水（状态流转/改价/规格书/编码变更…）
 *   ② material_prices + price_logs —— 该客户该料的历史报价与**每一次改价**（828 条已有数据）
 *   ③ material_samples —— 送样登记
 *   ④ customer_materials.spec_document —— 规格书（取磁盘文件时间）
 *
 * ⚠️ **记事不进时间线**（祥哥 2026-10-14 明确要求）：记事是「客户级」的沟通记录，
 *    物料时间线只看这个物料自己的硬事实，两边彻底分开、互不干扰。要看沟通去记事模块。
 *
 * 匹配规则（宁可少收，不要乱收）：客户必须相同；料号/编码**精确相等**；
 * 物料名只在「其中一方包含另一方且较短的那个不少于 8 个字」时才算命中 ——
 * 否则「3225」这种短名会把半个报价库都吸进来。
 */
import fs from 'fs'
import { queryAll, queryOne } from '../db.js'
import { resolveUrl } from './customerArchive.js'

const MIN_NAME_MATCH = 8   // 物料名互相包含时的最短长度，低于这个长度只认精确相等

const FIELD_LABEL = {
  price_with_tax: '含税价',
  price_without_tax: '未税价',
  cost_price: '成本价',
  material_name: '物料名称',
  material_spec: '规格',
  factory_code: '工厂编号',
  standard_lead_time: '交期',
  min_package: '最小包装',
  temperature: '温度',
  remarks: '备注'
}

/** 该物料记录用来跟别处对齐的「身份」：料号们 + 物料名 */
function identityOf(cm) {
  const codes = [cm.jkx_code, cm.material_code, cm.customer_code]
    .map(s => String(s || '').trim()).filter(Boolean)
  return { codes, name: String(cm.material_name || '').trim() }
}

function codeHits(identity, code) {
  const c = String(code || '').trim()
  return !!c && identity.codes.includes(c)
}

/** 名字算不算同一个 —— 短名容易误吞，所以要求够长才允许「包含」判定 */
function nameHits(identity, other) {
  const a = identity.name
  const b = String(other || '').trim()
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) >= MIN_NAME_MATCH
  return false
}

/** 数据目录里的文件修改时间（取不到返回 ''，绝不猜一个时间） */
function fileTime(url) {
  try {
    const hit = resolveUrl(url)
    if (!hit) return ''
    const st = fs.statSync(hit.abs)
    const d = st.mtime
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  } catch { return '' }
}

/**
 * 组装某个客户物料的进展时间线。
 * @param {number} materialId customer_materials.id
 * @returns {null | { material: object, items: Array, stats: object }}
 */
export function buildTimeline(materialId) {
  const id = Number(materialId)
  const cm = queryOne('SELECT * FROM customer_materials WHERE id = ?', [id])
  if (!cm) return null
  const identity = identityOf(cm)
  const items = []

  // ① 自建的进展流水
  const events = queryAll(
    'SELECT type, field, old_value, new_value, note, changed_at FROM material_events WHERE material_id = ? ORDER BY changed_at ASC, id ASC',
    [id]
  )
  for (const e of events) {
    items.push({
      at: e.changed_at,
      kind: 'event',
      type: e.type,
      field: e.field,
      old_value: e.old_value,
      new_value: e.new_value,
      note: e.note,
      source: '进展流水'
    })
  }

  // ② 报价记录 + 每一次改价（同客户 + 料号/名匹配）
  const quotes = queryAll(
    `SELECT id, created_at, updated_at, material_code, material_name, price_with_tax, price_without_tax,
            currency, factory_code, quoter, remarks
       FROM material_prices WHERE is_deleted = 0 AND first_inquiry_customer = ? ORDER BY created_at ASC`,
    [cm.customer]
  )
  const matchedQuotes = quotes.filter(q => codeHits(identity, q.material_code) || nameHits(identity, q.material_name))
  for (const q of matchedQuotes) {
    items.push({
      at: q.created_at,
      kind: 'quote',
      type: 'quote',
      new_value: q.price_with_tax != null ? String(q.price_with_tax) : '',
      old_value: '',
      note: `${q.material_code || q.material_name || '报价'}${q.quoter ? '（' + q.quoter + '）' : ''}`,
      source: '报价记录',
      ref_id: q.id
    })
    // 该条报价的字段级改动（price_logs 里存着 old→new）
    const logs = queryAll(
      'SELECT field_name, old_value, new_value, changed_at FROM price_logs WHERE record_id = ? ORDER BY changed_at ASC, id ASC',
      [q.id]
    )
    for (const l of logs) {
      items.push({
        at: l.changed_at,
        kind: 'price_log',
        type: 'price_change',
        field: l.field_name,
        old_value: l.old_value,
        new_value: l.new_value,
        note: FIELD_LABEL[l.field_name] || l.field_name,
        source: '报价记录',
        ref_id: q.id
      })
    }
  }

  // ③ 送样（该表没有客户列，按料号/名匹配）
  const samples = queryAll(
    `SELECT id, created_at, material_code, material_name, factory_code, stock_quantity, remarks
       FROM material_samples WHERE is_deleted = 0 ORDER BY created_at ASC`
  )
  const matchedSamples = samples.filter(s => codeHits(identity, s.material_code) || nameHits(identity, s.material_name))
  for (const s of matchedSamples) {
    items.push({
      at: s.created_at,
      kind: 'sample',
      type: 'sample',
      new_value: s.stock_quantity != null ? String(s.stock_quantity) : '',
      note: `送样登记${s.factory_code ? ' · 工厂 ' + s.factory_code : ''}${s.remarks ? ' · ' + s.remarks : ''}`,
      source: '样品登记',
      ref_id: s.id
    })
  }

  // ④ 规格书（记录里存着就展示；文件时间取得到就用它，取不到就只标记存在）
  if (cm.spec_document) {
    const t = fileTime(cm.spec_document)
    items.push({
      at: t,                       // 可能为空 —— 前端会显示成「时间未知」而不是编一个
      kind: 'spec',
      type: 'spec',
      new_value: cm.spec_document,
      note: '规格书已归档',
      source: '规格书',
      at_unknown: !t
    })
  }

  // ⑤ **显式关联**到这个物料的记事（祥哥 2026-10-14 明确要求：只有他主动关联过的才进，
  //    该客户的其他记事一概不进 —— 记事是客户级沟通记录，不能往物料上倒）。
  //    判据是记事里 material_refs 的 material_id 命中，比按客户名去猜可靠。
  const allNotes = queryAll(
    `SELECT id, title, content, created_at, material_refs FROM notes
      WHERE is_deleted = 0 AND material_refs IS NOT NULL AND material_refs != '[]'`
  )
  const linkedNotes = []
  for (const n of allNotes) {
    let refs = []
    try {
      const parsed = JSON.parse(n.material_refs || '[]')
      refs = Array.isArray(parsed) ? parsed : []
    } catch { continue }             // 脏数据跳过，不让一条坏 JSON 打断整条时间线
    for (const r of refs) {
      if (Number(r?.material_id) !== id) continue
      const qty = r.quantity ? `${r.quantity}${r.unit || ''}` : ''
      linkedNotes.push(n.id)
      items.push({
        at: n.created_at,
        kind: 'note',
        type: 'note',
        field: 'material_ref',
        old_value: '',
        new_value: qty,
        note: [r.action || '关联', qty, n.title ? `「${n.title}」` : ''].filter(Boolean).join(' '),
        source: '记事',
        ref_id: n.id
      })
    }
  }

  // 排序：有时间的新→旧；没有时间的（如取不到文件时间的规格书）沉到末尾
  items.sort((a, b) => {
    if (!a.at && !b.at) return 0
    if (!a.at) return 1
    if (!b.at) return -1
    return a.at < b.at ? 1 : (a.at > b.at ? -1 : 0)
  })

  // 阶段统计：从最早一条到最近一条，以及各状态第一次出现的时间
  const statusItems = items.filter(i => (i.kind === 'event' && i.type === 'status') || (i.kind === 'event' && i.type === 'created'))
  const firstOfType = {}
  for (const i of statusItems.slice().reverse()) {
    const key = i.type === 'created' ? i.new_value : i.new_value
    if (key && !firstOfType[key]) firstOfType[key] = i.at
  }

  return {
    material: {
      id: cm.id,
      customer: cm.customer,
      material_name: cm.material_name,
      jkx_code: cm.jkx_code,
      material_code: cm.material_code,
      customer_code: cm.customer_code,
      status: cm.status,
      price: cm.price,
      cost_price: cm.cost_price,
      date: cm.date,
      factory: cm.factory,
      created_at: cm.created_at,
      updated_at: cm.updated_at
    },
    items,
    stats: {
      total: items.length,
      quotes: matchedQuotes.length,
      samples: matchedSamples.length,
      events: events.length,
      notes: linkedNotes.length,
      first_quote_at: matchedQuotes.length ? matchedQuotes[0].created_at : '',
      first_seen_at: items.length ? (items[items.length - 1].at || '') : '',
      last_at: items.find(i => i.at)?.at || '',
      status_first_seen: firstOfType
    }
  }
}
