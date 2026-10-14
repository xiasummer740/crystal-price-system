/**
 * 物料「阶段停留时长」—— 现在停在某个状态多久了。
 *
 * 祥哥 2026-10-14 提的场景：「卡在送样 18 天」。但**数据基础是先天的短板**，必须两段口径，
 * 界面上要分清楚，不能混着糊弄：
 *   · **精确**：`material_events` 里有该物料最后一次 `status`/`created` 事件 →
 *     从那一刻算起（本功能上线后每次改状态都会写事件）
 *   · **估算**：没有事件（本功能上线前就停在当前状态）→ 从 `updated_at` 算起，
 *     含义是「多久没动静」。生产库实测：300 条物料里 0 条有状态事件 ⇒ 一上来全是估算，
 *     所以界面上必须标「估算」，否则用户会以为系统知道「什么时候进的这一阶段」。
 *
 * 时间口径：一律按**本地日期**相减（把两端都归到当天 0 点再算天数）。
 * 直接减毫秒会因「跨没跨过 24 小时」和夏令时/时区偏移差一天 —— 天数这类展示不值当为此出错。
 */
import { queryAll, queryOne } from '../db.js'

/** 已量产 = 终态：不再参与超期提醒（否则那几百条量产料会永远标红一片） */
export const TERMINAL_STATUS = '下批量'

/** 默认设置：**不预设阈值**（祥哥要求「可以不默认」）—— 阈值全 0 = 该阶段不提醒 */
export const DEFAULT_STALE_SETTINGS = {
  enabled: false,
  thresholds: { 报价: 0, 规格书: 0, 送样: 0, 下散单: 0 }
}

/** 本地日期差（整天）。from 支持 'YYYY-MM-DD HH:MM:SS' 或 ISO 串；无效返回 null */
export function daysBetween(from, now = new Date()) {
  if (!from) return null
  // 'YYYY-MM-DD HH:MM:SS' 里带空格，先换成 T 再解析；不带时区后缀 ⇒ 按本地时间解析
  const d = new Date(String(from).trim().replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return null
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))
}

/**
 * 一次性取出「每个物料的最后一次状态事件时间」。
 * 不写成每行一个相关子查询：300 行就是 300 次子查询，白白慢。
 * @returns {Map<number, string>} material_id → changed_at
 */
export function dwellIndex() {
  const map = new Map()
  try {
    for (const r of queryAll(`SELECT material_id, MAX(changed_at) AS last_at FROM material_events
                               WHERE type IN ('status', 'created') GROUP BY material_id`)) {
      if (r.material_id) map.set(Number(r.material_id), r.last_at)
    }
  } catch { /* 旧库还没有这张表 —— 全部走估算口径即可，别让列表接口挂掉 */ }
  return map
}

/**
 * 给列表行补上停留字段（原地改）：
 *   dwell_from  —— 从什么时候算起
 *   dwell_days  —— 停留天数
 *   dwell_exact —— true=精确（有状态事件）/ false=估算（按上次改动）
 */
export function annotateDwell(rows, index = dwellIndex(), now = new Date()) {
  for (const row of rows || []) {
    const evAt = index.get(Number(row.id))
    const from = evAt || row.updated_at || row.created_at || ''
    row.dwell_from = from
    row.dwell_days = daysBetween(from, now)
    row.dwell_exact = !!evAt
    row.is_terminal = String(row.status || '').trim() === TERMINAL_STATUS
  }
  return rows
}

/** 读取超期设置（坏 JSON / 缺字段一律退回默认，别让一个坏值把整个功能变成 500） */
export function readStaleSettings() {
  let raw = ''
  try { raw = queryOne('SELECT value FROM app_settings WHERE key = ?', ['material_stale'])?.value || '' } catch { raw = '' }
  if (!raw) return { ...DEFAULT_STALE_SETTINGS, thresholds: { ...DEFAULT_STALE_SETTINGS.thresholds } }
  try {
    const parsed = JSON.parse(raw)
    return {
      enabled: !!parsed.enabled,
      thresholds: { ...DEFAULT_STALE_SETTINGS.thresholds, ...(parsed.thresholds || {}) }
    }
  } catch {
    return { ...DEFAULT_STALE_SETTINGS, thresholds: { ...DEFAULT_STALE_SETTINGS.thresholds } }
  }
}

/**
 * 算出「超期」清单。
 * 判定：状态不是终态（下批量）＋ 该阶段阈值 > 0 ＋ 停留天数 > 阈值。
 * 阈值逐阶段配（报价最容易拖、下散单可以慢），**全 0 = 不提醒**（默认）。
 */
export function computeStale(rows, settings) {
  const { enabled, thresholds } = settings
  const list = (rows || [])
    .filter(r => !r.is_terminal)
    .map(r => {
      const th = Number(thresholds?.[String(r.status || '').trim()] || 0)
      return { ...r, threshold: th, over: enabled && th > 0 && (r.dwell_days ?? 0) > th }
    })
    .filter(r => r.over)
    .sort((a, b) => (b.dwell_days || 0) - (a.dwell_days || 0))
  const byStatus = {}
  for (const r of list) byStatus[r.status] = (byStatus[r.status] || 0) + 1
  return { enabled, thresholds: { ...thresholds }, count: list.length, by_status: byStatus, list }
}
