/**
 * 客户账期 / 对账付款信息（祥哥 2026-10-15 需求）
 *
 * 显示在「客户物料」页头选中客户那一行，入口也在同一处 + 名册管理。
 *
 * **两种口径都支持**（祥哥拍板「两者都要」）：
 *   ① 结构化：`每月对账日`（1-31）+ `对账后多少天付款` ⇒ 系统自己算下次对账/应付日，**永不失效**
 *   ② 手填覆写：`next_statement_date`（具体日期）⇒ **优先**，但会过期，过期时明确提示「请更新」
 * 为什么两个都要：结构化的能自动滚动但表达不了「这次特殊，10 号补对账」；手填的直观但需要人维护。
 * 让手填**优先**而不是合并，是为了避免「按哪个算」的歧义 —— 界面上会标出「手动指定」。
 *
 * 日期一律按**本地日期**算（归到当天 0 点比天数），与「停留时长」同一套口径，
 * 免得出现「晚上看是一天、早上看是另一天」。
 */
import { queryOne, execute, saveNow } from '../db.js'

/** 账期预设（界面下拉用；也允许自填，因为实际账期千奇百怪） */
export const PAYMENT_TERM_PRESETS = ['款到发货', '货到付款', '月结30天', '月结60天', '月结90天', '预付30%', '预付50%']

/** 可写字段（白名单，防前端塞别的列） */
export const PROFILE_FIELDS = ['payment_terms', 'statement_day', 'payment_days', 'next_statement_date', 'pay_remark']

const pad = (n) => String(n).padStart(2, '0')
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 该月「第 day 号」；该月没这一天（如 2 月 31 号）就收敛到当月最后一天 */
function dayInMonth(year, month, day) {
  const last = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, last))
}

/** 严格解析 YYYY-MM-DD（不接受 '2026-1-5' 这类松格式，避免歧义）；非法返回 null */
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null  // 2026-02-30 这类
  return dt
}

const daysBetween = (from, to) => Math.round((new Date(to.getFullYear(), to.getMonth(), to.getDate()) - new Date(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000)

/**
 * 算出「下次对账日 / 应付日 / 还剩几天」——纯函数，便于单测。
 * @param {object} profile  { statement_day, payment_days, next_statement_date }
 * @param {Date}   today
 */
export function computeSchedule(profile = {}, today = new Date()) {
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const manualRaw = String(profile.next_statement_date || '').trim()
  const manualDate = parseDate(manualRaw)
  const manual = !!manualDate
  let statementDate = null
  let auto = false

  if (manualDate) {
    statementDate = manualDate
  } else {
    const day = Number(profile.statement_day) || 0
    if (day >= 1 && day <= 31) {
      auto = true
      statementDate = dayInMonth(today0.getFullYear(), today0.getMonth(), day)
      // 本月这天已经过了 ⇒ 滚到下个月（对账日通常是「下一个」要处理的日子）
      if (daysBetween(today0, statementDate) < 0) {
        statementDate = dayInMonth(today0.getFullYear(), today0.getMonth() + 1, day)
      }
    }
  }

  const paymentDays = Number(profile.payment_days) || 0
  let dueDate = null
  if (statementDate && paymentDays > 0) {
    dueDate = new Date(statementDate.getFullYear(), statementDate.getMonth(), statementDate.getDate() + paymentDays)
  }
  const daysLeft = statementDate ? daysBetween(today0, statementDate) : null
  return {
    has_schedule: !!statementDate,
    manual,                                   // 是否手填覆写
    auto,                                     // 是否按每月对账日自动算
    statement_date: statementDate ? fmt(statementDate) : '',
    due_date: dueDate ? fmt(dueDate) : '',
    days_left: daysLeft,                      // 距离下次对账：负数=已过期
    // 手填日期已过期 ⇒ 必须提醒用户更新，否则他会一直看到一个过去的日期
    manual_expired: manual && daysLeft < 0,
    // 应付日过了多久（**不叫「逾期未付」**：我们并不知道他到底付没付，只报事实）
    due_passed_days: dueDate ? Math.max(0, daysBetween(dueDate, today0)) : 0
  }
}

/** 读一个客户的账期资料（不存在返回全空 + 计算结果的空壳） */
export function readProfile(name) {
  const empty = { payment_terms: '', statement_day: 0, payment_days: 0, next_statement_date: '', pay_remark: '', profile_updated_at: '' }
  const row = queryOne(
    `SELECT name, payment_terms, statement_day, payment_days, next_statement_date, pay_remark, profile_updated_at
       FROM customers WHERE name = ?`, [name]
  )
  const profile = row ? { ...empty, ...row } : { ...empty, name }
  return { ...profile, schedule: computeSchedule(profile) }
}

/** 规范化写入值（越界一律夹到合法范围，别让歪数据进库） */
export function normalizeProfile(body = {}) {
  const out = {}
  out.payment_terms = String(body.payment_terms ?? '').trim().slice(0, 50)
  const day = Number(body.statement_day) || 0
  out.statement_day = day >= 1 && day <= 31 ? Math.trunc(day) : 0
  const pd = Number(body.payment_days) || 0
  out.payment_days = pd >= 0 && pd <= 365 ? Math.trunc(pd) : 0
  const rawNext = String(body.next_statement_date ?? '').trim()
  // 非法日期不静默丢弃：直接报错让用户改，否则他会以为存上了
  if (rawNext && !parseDate(rawNext)) return { error: `「下次对账日」格式不对（要 YYYY-MM-DD，例如 2026-11-05）：${rawNext}` }
  out.next_statement_date = rawNext
  out.pay_remark = String(body.pay_remark ?? '').trim().slice(0, 500)
  return { data: out }
}

/** 保存（upsert）：客户不在名册里就补一行 —— 这样「只填了账期、还没有物料」的客户也会出现在客户列表 */
export function saveProfile(name, body) {
  const { data, error } = normalizeProfile(body)
  if (error) return { error }
  execute(
    `INSERT INTO customers (name, source, payment_terms, statement_day, payment_days, next_statement_date, pay_remark, profile_updated_at)
     VALUES (?, 'profile', ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(name) DO UPDATE SET
       payment_terms = excluded.payment_terms,
       statement_day = excluded.statement_day,
       payment_days = excluded.payment_days,
       next_statement_date = excluded.next_statement_date,
       pay_remark = excluded.pay_remark,
       profile_updated_at = excluded.profile_updated_at`,
    [name, data.payment_terms, data.statement_day, data.payment_days, data.next_statement_date, data.pay_remark]
  )
  saveNow()
  return { data: readProfile(name) }
}

/** 这条名册记录上有没有填过账期资料（删除保护用：填过就不许删名册，免得资料跟着没了） */
export function hasProfile(name) {
  const r = queryOne(
    `SELECT payment_terms, statement_day, payment_days, next_statement_date, pay_remark FROM customers WHERE name = ?`, [name]
  )
  if (!r) return false
  return !!(String(r.payment_terms || '').trim() || Number(r.statement_day) > 0 || Number(r.payment_days) > 0 ||
            String(r.next_statement_date || '').trim() || String(r.pay_remark || '').trim())
}
