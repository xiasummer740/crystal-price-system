/**
 * 客户账期 / 对账付款资料 —— 单测 + 接口测试
 *
 * 祥哥 2026-10-15 需求：在「客户物料」页头（选中客户那一行）显示账期、对账付款时间、备注；
 * 口径「两者都要」= 结构化（每月对账日 + 账期天数，自动滚动）+ 手填具体日期（优先）。
 *
 * 这里钉住的关键行为：
 *   - 手填日期**优先**于自动算；手填过期要明确报出来（否则他会一直看一个过去的日期）
 *   - 月末收敛：每月 31 号对账，2 月要收敛到 28/29 号，不能算到 3 月去
 *   - 本月对账日已过 ⇒ 滚到下个月
 *   - 应付日 = 对账日 + 账期天数；「应付日已过 N 天」只报事实（不叫逾期未付，我们不知道他付没付）
 *   - 填了资料的客户**不许从名册删**（资料只挂在名册那行上，删了就真没了）
 *   - 合并时账期跟着走（目标已填则保留目标的）
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-profile-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server, dbMod, profMod
before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '规格书'), { recursive: true })
  dbMod = await import('../server/src/db.js')
  await dbMod.initDb()
  profMod = await import('../server/src/utils/customerProfile.js')
  const customersRouter = (await import('../server/src/routes/customers.js')).default
  const app = express()
  app.use(express.json())
  app.use('/api/customers', customersRouter)
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

const D = (y, m, d) => new Date(y, m - 1, d)

describe('对账/付款日期计算（纯函数）', () => {
  it('① 每月对账日：本月还没到就用本月', () => {
    const s = profMod.computeSchedule({ statement_day: 20, payment_days: 30 }, D(2026, 10, 15))
    assert.equal(s.statement_date, '2026-10-20')
    assert.equal(s.days_left, 5)
    assert.equal(s.auto, true)
    assert.equal(s.manual, false)
    assert.equal(s.due_date, '2026-11-19', '对账日 + 30 天')
  })

  it('② 本月已过 ⇒ 滚到下个月（含跨年）', () => {
    assert.equal(profMod.computeSchedule({ statement_day: 5 }, D(2026, 10, 15)).statement_date, '2026-11-05')
    assert.equal(profMod.computeSchedule({ statement_day: 5 }, D(2026, 12, 20)).statement_date, '2027-01-05', '跨年')
    // 当天算「还没过」——今天就是对账日时不该跳到下月
    assert.equal(profMod.computeSchedule({ statement_day: 15 }, D(2026, 10, 15)).statement_date, '2026-10-15')
  })

  it('③ 月末收敛：每月 31 号对账，2 月要收敛到该月最后一天（闰年 29）', () => {
    assert.equal(profMod.computeSchedule({ statement_day: 31 }, D(2026, 1, 10)).statement_date, '2026-01-31')
    assert.equal(profMod.computeSchedule({ statement_day: 31 }, D(2026, 2, 10)).statement_date, '2026-02-28')
    assert.equal(profMod.computeSchedule({ statement_day: 31 }, D(2028, 2, 10)).statement_date, '2028-02-29', '闰年')
    assert.equal(profMod.computeSchedule({ statement_day: 31 }, D(2026, 4, 10)).statement_date, '2026-04-30', '小月')
  })

  it('④ 手填日期优先；过期要报出来（但仍然是它）', () => {
    const s = profMod.computeSchedule({ statement_day: 20, next_statement_date: '2026-10-18' }, D(2026, 10, 15))
    assert.equal(s.statement_date, '2026-10-18', '手填优先于「每月 20 号」')
    assert.equal(s.manual, true)
    assert.equal(s.auto, false)
    const past = profMod.computeSchedule({ statement_day: 20, next_statement_date: '2026-10-01' }, D(2026, 10, 15))
    assert.equal(past.manual_expired, true, '手填日期已过 ⇒ 提示更新')
    assert.equal(past.days_left, -14)
    assert.equal(past.statement_date, '2026-10-01', '不能悄悄改成自动算的日子')
  })

  it('⑤ 没填对账日就没有日程；应付日过了只报「过了几天」', () => {
    const none = profMod.computeSchedule({}, D(2026, 10, 15))
    assert.equal(none.has_schedule, false)
    assert.equal(none.statement_date, '')
    const s = profMod.computeSchedule({ next_statement_date: '2026-10-01', payment_days: 10 }, D(2026, 10, 15))
    assert.equal(s.due_date, '2026-10-11')
    assert.equal(s.due_passed_days, 4)
    assert.equal(profMod.computeSchedule({ next_statement_date: '2026-12-01', payment_days: 10 }, D(2026, 10, 15)).due_passed_days, 0)
  })

  it('⑥ 非法手填日期不当作有效值（退回自动算，不会算出怪日期）', () => {
    for (const bad of ['2026-13-01', '2026-02-30', '2026/11/05', '2026-1-5', '不是日期']) {
      const s = profMod.computeSchedule({ statement_day: 20, next_statement_date: bad }, D(2026, 10, 15))
      assert.equal(s.manual, false, `${bad} 不该被当成手填日期`)
      assert.equal(s.statement_date, '2026-10-20')
    }
  })
})

describe('账期资料接口', () => {
  it('⑦ 保存后能读回；客户不在名册里会自动补一行（并集里就能选到）', async () => {
    const name = '账期测试客户甲'
    const save = await request.post('/api/customers/profile').send({
      name, payment_terms: '月结30天', statement_day: 5, payment_days: 30, pay_remark: '每月 5 号发对账单'
    })
    assert.equal(save.status, 200, JSON.stringify(save.body))
    const get = await request.get('/api/customers/profile').query({ name })
    assert.equal(get.body.data.payment_terms, '月结30天')
    assert.equal(get.body.data.statement_day, 5)
    assert.equal(get.body.data.payment_days, 30)
    assert.equal(get.body.data.pay_remark, '每月 5 号发对账单')
    assert.ok(get.body.data.schedule.statement_date, '应算出下次对账日')
    assert.ok(Array.isArray(get.body.data.presets) && get.body.data.presets.length, '应带上账期预设')
    // 名册里有了它 ⇒ 客户列表（并集）里也会出现
    const reg = dbMod.queryOne('SELECT name, source FROM customers WHERE name = ?', [name])
    assert.ok(reg, '应自动进名册')
  })

  it('⑧ 非法「下次对账日」要报错，不能静默存歪值', async () => {
    const r = await request.post('/api/customers/profile').send({ name: '账期测试客户乙', statement_day: 5, next_statement_date: '2026/11/05' })
    assert.equal(r.status, 400)
    assert.match(r.body.msg, /下次对账日/)
  })

  it('⑨ 越界值被夹到合法范围（不写脏数据）', async () => {
    const r = await request.post('/api/customers/profile').send({ name: '账期测试客户丙', statement_day: 99, payment_days: -5 })
    assert.equal(r.status, 200)
    assert.equal(r.body.data.statement_day, 0, '99 号不合法 ⇒ 0（不设）')
    assert.equal(r.body.data.payment_days, 0)
  })

  it('⑩ 填过账期的客户不许从名册删（资料只挂在那一行上）', async () => {
    const name = '账期测试客户丁'
    await request.post('/api/customers/profile').send({ name, payment_terms: '月结60天' })
    const del = await request.delete(`/api/customers/${encodeURIComponent(name)}`)
    assert.equal(del.status, 409)
    assert.match(del.body.msg, /账期|备注/)
    // 清空资料后就能删了
    await request.post('/api/customers/profile').send({ name, payment_terms: '', statement_day: 0, payment_days: 0, pay_remark: '' })
    const del2 = await request.delete(`/api/customers/${encodeURIComponent(name)}`)
    assert.equal(del2.status, 200, JSON.stringify(del2.body))
  })

  it('⑪ 合并客户时账期跟着走（目标为空才搬；目标已填则保留目标）', async () => {
    // 目标为空：搬过去
    await request.post('/api/customers/profile').send({ name: '简写客户A', payment_terms: '月结30天', statement_day: 10 })
    await request.post('/api/customers/profile').send({ name: '全名客户A', payment_terms: '' })
    const m1 = await request.post('/api/customers/merge').send({ from: '简写客户A', to: '全名客户A' })
    assert.equal(m1.status, 200, JSON.stringify(m1.body))
    const p1 = await request.get('/api/customers/profile').query({ name: '全名客户A' })
    assert.equal(p1.body.data.payment_terms, '月结30天', '空目标应承接来源的账期')
    assert.equal(p1.body.data.statement_day, 10)

    // 目标已填：保留目标的，不被覆盖
    await request.post('/api/customers/profile').send({ name: '简写客户B', payment_terms: '月结90天' })
    await request.post('/api/customers/profile').send({ name: '全名客户B', payment_terms: '款到发货' })
    await request.post('/api/customers/merge').send({ from: '简写客户B', to: '全名客户B' })
    const p2 = await request.get('/api/customers/profile').query({ name: '全名客户B' })
    assert.equal(p2.body.data.payment_terms, '款到发货', '目标已填 ⇒ 保留目标的')
  })
})
