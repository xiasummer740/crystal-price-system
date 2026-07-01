import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// 从 export.js 提取的日期解析函数（保持逻辑一致）
function formatLocal(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function parseExcelDate(v) {
  if (v === undefined || v === null || v === '') return null
  if (v instanceof Date && !isNaN(v.getTime())) return formatLocal(v)
  if (typeof v === 'number' && isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return formatLocal(d)
    return null
  }
  const s = String(v).trim()
  if (!s) return null
  const norm = s
    .replace(/年|月/g, '-')
    .replace(/日/g, ' ')
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  const d = new Date(norm)
  if (!isNaN(d.getTime())) return formatLocal(d)
  return null
}

describe('parseExcelDate', () => {

  it('null/undefined/空字符串返回 null', () => {
    assert.equal(parseExcelDate(null), null)
    assert.equal(parseExcelDate(undefined), null)
    assert.equal(parseExcelDate(''), null)
  })

  it('JS Date 对象正确格式化', () => {
    const d = new Date(2025, 0, 15, 14, 30, 0) // 2025-01-15 14:30:00
    assert.equal(parseExcelDate(d), '2025-01-15 14:30:00')
  })

  it('Excel 数字序列号正确转换', () => {
    // 2025-06-15 → Excel serial ≈ 45823
    // 1899-12-30 + 45823 = 2025-06-15 左右
    // Excel serial 1 = 1900-01-01 (but actually 1900-01-01 = 1, with the Lotus 123 bug)
    // Excel 日期序列号基准: 1899-12-30 (serial 0 = 1899-12-30 00:00)
    // 2024-01-01 = (2024-01-01 in ms - 1899-12-30 in ms) / 86400000
    // 实际测: 2024-01-01 → serial 45292
    const result = parseExcelDate(45292) // ≈ 2024-01-01
    assert.ok(result.startsWith('2024-01-01'))
  })

  it('ISO 字符串格式', () => {
    // Date-only ISO 字符串按 UTC 解析，本地时区偏移后显示
    const r1 = parseExcelDate('2025-03-20')
    assert.ok(r1.startsWith('2025-03-20'))

    const r2 = parseExcelDate('2025-03-21 10:30:00')
    assert.ok(r2.startsWith('2025-03-21'))
    assert.ok(r2.includes('10:30'))
  })

  it('中文日期格式', () => {
    // 中文格式被替换为 ISO-like 再解析，时区同 ISO
    const r1 = parseExcelDate('2025年03月20日 14:30')
    assert.ok(r1.startsWith('2025-03-20'))
    assert.ok(r1.includes('14:30'))

    const r2 = parseExcelDate('2025年3月5日')
    assert.ok(r2.startsWith('2025-03-05'))
  })

  it('斜杠日期格式', () => {
    const r1 = parseExcelDate('2025/03/20')
    assert.ok(r1.startsWith('2025-03-20'))

    const r2 = parseExcelDate('2025/03/23 14:30')
    assert.ok(r2.startsWith('2025-03-23'))
    assert.ok(r2.includes('14:30'))
  })

  it('非法日期返回 null', () => {
    assert.equal(parseExcelDate('not-a-date'), null)
    assert.equal(parseExcelDate('2025-13-01'), null) // 无效月份
  })

})

describe('formatLocal', () => {

  it('格式化本地时间', () => {
    // 1月 = 0
    const d = new Date(2025, 11, 25, 8, 5, 3) // 2025-12-25 08:05:03
    assert.equal(formatLocal(d), '2025-12-25 08:05:03')
  })

  it('补零', () => {
    const d = new Date(2025, 0, 1, 0, 0, 0) // 2025-01-01 00:00:00
    assert.equal(formatLocal(d), '2025-01-01 00:00:00')
  })

})
