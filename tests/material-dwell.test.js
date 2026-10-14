/**
 * 阶段停留时长 / 超期判定 / 月度汇总 — 集成测试
 *
 * 祥哥 2026-10-14 的三个诉求：
 *   ① 「卡在送样 18 天」这类提醒 → 停留时长 + 超期清单
 *   ② 按阶段看板 / 客户月度汇总（这个月报价几个、送样几个、下单几个）
 *   ③ 日志文件别再叫 error-*.log（顺带，见 tests/logger.test.js 的既有覆盖）
 *
 * 这里钉住的关键行为：
 *   - 停留口径两段式：有状态事件=精确、没有=按 updated_at 估算（**界面要能区分**）
 *   - 天数按**本地日期**相减（不是毫秒/24 小时）
 *   - 「下批量」是终态，**不参与**超期提醒
 *   - 阈值**默认全 0 = 不提醒**（祥哥要求「可以不默认」）；设了才提醒
 *   - 月度汇总口径：报价/改价/送样可追溯历史；状态推进与记事数量自 v1.0.223 起才有
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-dwell-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server, dbMod, dwellMod
before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '规格书'), { recursive: true })
  dbMod = await import('../server/src/db.js')
  await dbMod.initDb()
  dwellMod = await import('../server/src/utils/materialDwell.js')
  const materialsRouter = (await import('../server/src/routes/materials.js')).default
  const app = express()
  app.use(express.json())
  app.use('/api/materials', materialsRouter)
  app.use((err, _req, res, _next) => res.status(500).json({ code: 1, msg: err.message }))
  server = app.listen(0)
  const { default: supertest } = await import('supertest')
  request = supertest(server)
})
after(async () => {
  await new Promise(r => setTimeout(r, 300))
  try { server?.close() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

const pad = (n) => String(n).padStart(2, '0')
const dayStr = (offsetDays) => {
  const d = new Date(); d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 10:00:00`
}
let seq = 0
function makeMaterial(extra = {}) {
  seq++
  const r = dbMod.execute(
    `INSERT INTO customer_materials (customer, date, customer_code, jkx_code, material_name, factory, status)
     VALUES (?, '2026-05-01', ?, ?, '物料' || ?, 'SJK', ?)`,
    [extra.customer || '测试客户甲', `C-${seq}`, `J-${seq}`, String(seq), extra.status || '报价']
  )
  const id = r.lastInsertRowid
  if (extra.updated_at) dbMod.execute('UPDATE customer_materials SET updated_at = ? WHERE id = ?', [extra.updated_at, id])
  if (extra.eventAt) {
    dbMod.execute(
      `INSERT INTO material_events (material_id, type, field, old_value, new_value, changed_at) VALUES (?, 'status', 'status', '报价', ?, ?)`,
      [id, extra.status || '报价', extra.eventAt]
    )
  }
  return id
}
const staleApi = () => request.get('/api/materials/stale')
const setSettings = (obj) => dbMod.execute('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', ['material_stale', JSON.stringify(obj)])

describe('停留时长与超期判定', () => {
  it('① 天数按本地日期相减（跨没跨过 24 小时都算整天）', () => {
    const now = new Date(2026, 9, 14, 1, 0, 0)          // 10/14 凌晨 1 点
    assert.equal(dwellMod.daysBetween('2026-10-14 23:00:00', now), 0, '同一天 = 0 天')
    assert.equal(dwellMod.daysBetween('2026-10-13 23:00:00', now), 1, '差一天就是 1 天，不看小时')
    assert.equal(dwellMod.daysBetween('2026-09-14 10:00:00', now), 30)
    assert.equal(dwellMod.daysBetween('', now), null)
    assert.equal(dwellMod.daysBetween('不是时间', now), null)
  })

  it('② 有状态事件 = 精确口径；没有 = 按 updated_at 估算（两者必须能区分）', () => {
    const a = makeMaterial({ status: '送样', eventAt: dayStr(-18), updated_at: dayStr(-1) })
    const b = makeMaterial({ status: '送样', updated_at: dayStr(-7) })
    const rows = dbMod.queryAll('SELECT * FROM customer_materials WHERE id IN (?, ?)', [a, b])
    dwellMod.annotateDwell(rows)
    const ra = rows.find(r => r.id === a)
    const rb = rows.find(r => r.id === b)
    assert.equal(ra.dwell_exact, true, '有事件 → 精确')
    assert.equal(ra.dwell_days, 18, '精确口径按事件时间算，不是 updated_at')
    assert.equal(rb.dwell_exact, false, '没事件 → 估算')
    assert.equal(rb.dwell_days, 7, '估算口径按 updated_at 算')
  })

  it('③ 列表接口带停留字段，且能按停留排序', async () => {
    const id = makeMaterial({ status: '报价', updated_at: dayStr(-99) })
    const r = await request.get('/api/materials?pageSize=500')
    assert.equal(r.status, 200)
    const row = r.body.data.list.find(x => x.id === id)
    assert.ok(row, '新建的物料应在列表里')
    assert.equal(typeof row.dwell_days, 'number')
    assert.equal(row.dwell_exact, false)
    const sorted = await request.get('/api/materials?pageSize=500&sort=dwell&order=desc')
    const days = sorted.body.data.list.map(x => x.dwell_days ?? -1)
    assert.deepEqual(days, [...days].sort((x, y) => y - x), '按停留降序应有序')
  })

  it('④ 默认**不提醒**（阈值全 0 / 未启用）—— 祥哥要求「可以不默认」', async () => {
    makeMaterial({ status: '报价', updated_at: dayStr(-200) })
    const r = await staleApi()
    assert.equal(r.status, 200)
    assert.equal(r.body.data.enabled, false)
    assert.equal(r.body.data.count, 0, '没设阈值就不该报超期')
  })

  it('⑤ 设了阈值才提醒；逐阶段判、按停留降序', async () => {
    setSettings({ enabled: true, thresholds: { 报价: 30, 规格书: 0, 送样: 30, 下散单: 0 } })
    const oldQuote = makeMaterial({ status: '报价', updated_at: dayStr(-40) })   // 超（报价阈值 30）
    const newQuote = makeMaterial({ status: '报价', updated_at: dayStr(-3) })    // 不超
    const oldSpec = makeMaterial({ status: '规格书', updated_at: dayStr(-90) })  // 规格书阈值 0 → 不提醒
    const r = await staleApi()
    const ids = r.body.data.list.map(x => x.id)
    assert.ok(ids.includes(oldQuote), '报价 40 天应超期')
    assert.ok(!ids.includes(newQuote), '报价 3 天不该超期')
    assert.ok(!ids.includes(oldSpec), '规格书阈值是 0 ⇒ 不提醒')
    const d = r.body.data.list.map(x => x.dwell_days)
    assert.deepEqual(d, [...d].sort((x, y) => y - x), '按停留降序')
    assert.equal(r.body.data.by_status['报价'] >= 1, true)
  })

  it('⑥ 「下批量」是终态，再久也不提醒', async () => {
    makeMaterial({ status: '下批量', updated_at: dayStr(-500) })
    const r = await staleApi()
    assert.equal(r.body.data.list.some(x => x.status === '下批量'), false, '终态不该出现在超期清单里')
    assert.equal(r.body.data.terminal_status, '下批量')
  })

  it('⑦ 设置是坏 JSON 时退回默认（不能把接口搞成 500）', async () => {
    dbMod.execute('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', ['material_stale', '{坏掉的'])
    const s = dwellMod.readStaleSettings()
    assert.equal(s.enabled, false)
    assert.deepEqual(s.thresholds, { 报价: 0, 规格书: 0, 送样: 0, 下散单: 0 })
    const r = await staleApi()
    assert.equal(r.status, 200)
    setSettings({ enabled: true, thresholds: { 报价: 30, 规格书: 0, 送样: 30, 下散单: 0 } })
  })
})

describe('月度汇总', () => {
  it('⑧ 报价/改价按本月算，状态推进与记事数量也统计进来', async () => {
    const cust = '月度客户甲'
    const mid = makeMaterial({ customer: cust, status: '送样' })
    // 本月一条报价（created_at 默认现在）
    const q = dbMod.execute(
      `INSERT INTO material_prices (material_code, material_name, first_inquiry_customer, price_with_tax, is_deleted) VALUES ('M1','物料M1',?,0.5,0)`,
      [cust]
    )
    // 本月一次改价（price_logs 直接写，模拟 prices 路由的日志）
    dbMod.execute(`INSERT INTO price_logs (material_code, record_id, field_name, old_value, new_value) VALUES ('M1', ?, 'price_with_tax', '0.5', '0.45')`, [q.lastInsertRowid])
    // 本月一次状态推进（事件）
    dbMod.execute(`INSERT INTO material_events (material_id, type, field, old_value, new_value) VALUES (?, 'status', 'status', '报价', '送样')`, [mid])
    // 本月一条关联记事（下单 5000 / 备货 3000）
    dbMod.execute(
      `INSERT INTO notes (title, content, customer, material_refs) VALUES ('月度验证', '', ?, ?)`,
      [cust, JSON.stringify([{ material_id: mid, name: '物料M1', action: '下单', quantity: '5000' }, { material_id: mid, name: '物料M1', action: '备货', quantity: '3000' }])]
    )
    // 送样登记（无客户列 → 只进全局数）
    dbMod.execute(`INSERT INTO material_samples (material_code, material_name) VALUES ('M1','物料M1')`)

    const r = await request.get('/api/materials/monthly')
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const row = r.body.data.customers.find(x => x.customer === cust)
    assert.ok(row, '汇总里应有这个客户')
    assert.equal(row.quotes, 1, '报价次数')
    assert.equal(row.price_changes, 1, '改价次数')
    assert.equal(row.advances, 1, '状态推进次数')
    assert.equal(row.advance_by_status['送样'], 1)
    assert.equal(row.order_qty, 5000, '下单数量合计')
    assert.equal(row.stock_qty, 3000, '备货数量合计')
    assert.ok(r.body.data.samples_registered >= 1, '送样登记是全局数')
    assert.ok(r.body.data.notes.some(n => n.includes('自 2026-10-14')), '必须说明历史缺口')
  })

  it('⑨ 区间之外的数据不计入（口径不能虚高）', async () => {
    const before = await request.get('/api/materials/monthly?start=2000-01-01&end=2000-01-31')
    assert.equal(before.body.data.customers.length, 0, '2000 年不该有任何数据')
    assert.equal(before.body.data.totals.quotes, 0)
  })
})
