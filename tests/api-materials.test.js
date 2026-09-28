/**
 * 客户物料 API 集成测试
 *
 * 测试客户物料编码 / 晶科鑫料号防重复逻辑：
 * - 同客户内 客户物料编码、晶科鑫料号 各自唯一，重复则拦截
 * - 不同客户可以有相同料号（同一颗料卖给多个客户）
 * - 编辑时排除自身
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-materials-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server
const BASE = '/api/materials'
const testIds = []

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '规格书'), { recursive: true })
  const dbMod = await import('../server/src/db.js')
  await dbMod.initDb()

  const materialsRouter = (await import('../server/src/routes/materials.js')).default
  const app = express()
  app.use(express.json())
  app.use(BASE, materialsRouter)
  app.use((err, _req, res, _next) => {
    res.status(500).json({ code: 1, msg: err.message })
  })
  server = app.listen(0)
  const { default: supertest } = await import('supertest')
  request = supertest(server)
})

after(async () => {
  await new Promise(r => setTimeout(r, 300))
  try { server?.close() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('POST /api/materials — 防重复校验', () => {
  const base = { customer: '深圳测试客户', customer_code: 'CUS-001', jkx_code: 'JKX-001', material_name: '32.768KHz', status: '报价' }

  it('首条新增成功', async () => {
    const res = await request.post(BASE).send(base)
    assert.equal(res.body.code, 0, `首条应新增成功: ${res.body.msg || res.status}`)
    testIds.push(res.body.data.id)
  })

  it('同客户相同客户物料编码 → 拦截', async () => {
    const res = await request.post(BASE).send({ ...base, jkx_code: 'JKX-OTHER' })
    assert.equal(res.status, 400, '同客户重复客户物料编码应 400')
    assert.ok(res.body.msg?.includes('客户物料编码 CUS-001'), `应提示客户物料编码重复: ${res.body.msg}`)
  })

  it('同客户相同晶科鑫料号 → 拦截', async () => {
    const res = await request.post(BASE).send({ ...base, customer_code: 'CUS-OTHER' })
    assert.equal(res.status, 400, '同客户重复晶科鑫料号应 400')
    assert.ok(res.body.msg?.includes('晶科鑫料号 JKX-001'), `应提示晶科鑫料号重复: ${res.body.msg}`)
  })

  it('不同客户相同晶科鑫料号 → 允许', async () => {
    const res = await request.post(BASE).send({ ...base, customer: '另一家客户' })
    assert.equal(res.body.code, 0, '不同客户可用相同料号')
    testIds.push(res.body.data.id)
  })

  it('同客户不同编码 → 允许', async () => {
    const res = await request.post(BASE).send({ ...base, customer_code: 'CUS-002', jkx_code: 'JKX-002' })
    assert.equal(res.body.code, 0, '不同编码应允许')
    testIds.push(res.body.data.id)
  })

  it('空编码 → 允许（不校验空值）', async () => {
    const res = await request.post(BASE).send({ customer: '深圳测试客户', material_name: '无编码物料' })
    assert.equal(res.body.code, 0, '空编码应允许')
    testIds.push(res.body.data.id)
  })
})

describe('GET /api/materials — 排序', () => {
  const C = '排序测试客户'
  // 日期、报价、名称刻意错开，好区分是按哪一列排的
  const SEED = [
    { customer_code: 'S-1', jkx_code: 'J-1', material_name: 'BBB', price: '9', cost_price: '300', factory: 'A厂', status: '报价', date: '2026-03-01' },
    { customer_code: 'S-2', jkx_code: 'J-2', material_name: 'AAA', price: '100', cost_price: '20', factory: 'B厂', status: '送样', date: '2026-01-01' },
    { customer_code: 'S-3', jkx_code: 'J-3', material_name: 'CCC', price: '50', cost_price: '1', factory: 'C厂', status: '下批量', date: '2026-02-01' },
    // 没报价的记录：price 为空串，排序时不能被当成 0 挤到最前
    { customer_code: 'S-4', jkx_code: 'J-4', material_name: 'DDD', price: '', cost_price: '', factory: 'D厂', status: '报价', date: '2026-04-01' }
  ]

  before(async () => {
    for (const s of SEED) {
      const res = await request.post(BASE).send({ customer: C, ...s })
      assert.equal(res.body.code, 0, `种子数据应写入成功: ${res.body.msg || res.status}`)
      testIds.push(res.body.data.id)
    }
  })

  // 断言统一用 customer_code 的排列顺序，比断言数值更能说明"到底按哪一列排的"
  const codes = (res) => res.body.data.list.map(r => r.customer_code).join(',')

  it('不传 sort → 保持默认（日期倒序）', async () => {
    const res = await request.get(BASE).query({ customer: C })
    assert.equal(codes(res), 'S-4,S-1,S-3,S-2')
  })

  it('sort=price&order=asc → 按报价数值升序（不是字符串序）', async () => {
    const res = await request.get(BASE).query({ customer: C, sort: 'price', order: 'asc' })
    // 字符串序会排成 "100","50","9"；数值序才是 9,50,100
    assert.equal(codes(res), 'S-1,S-3,S-2,S-4')
  })

  it('sort=price&order=desc → 按报价数值降序', async () => {
    const res = await request.get(BASE).query({ customer: C, sort: 'price', order: 'desc' })
    assert.equal(codes(res), 'S-2,S-3,S-1,S-4')
  })

  it('空报价在升序/降序里都沉底（不因方向翻转而跑到最前）', async () => {
    const asc = await request.get(BASE).query({ customer: C, sort: 'cost_price', order: 'asc' })
    const desc = await request.get(BASE).query({ customer: C, sort: 'cost_price', order: 'desc' })
    // S-4 成本价为空串，转数值后是 NULL；不加 NULLS LAST 的话升序会把它顶到第一位
    assert.equal(asc.body.data.list.at(-1).customer_code, 'S-4', '升序时空成本价应在最后')
    assert.equal(desc.body.data.list.at(-1).customer_code, 'S-4', '降序时空成本价也应在最后')
  })

  it('sort=material_name&order=asc → 按物料名称升序', async () => {
    const res = await request.get(BASE).query({ customer: C, sort: 'material_name', order: 'asc' })
    assert.equal(codes(res), 'S-2,S-1,S-3,S-4')
  })

  it('sort=date&order=asc → 按日期升序', async () => {
    const res = await request.get(BASE).query({ customer: C, sort: 'date', order: 'asc' })
    assert.equal(codes(res), 'S-2,S-3,S-1,S-4')
  })

  it('缺 order 参数 → 默认降序', async () => {
    const res = await request.get(BASE).query({ customer: C, sort: 'price' })
    assert.equal(codes(res), 'S-2,S-3,S-1,S-4')
  })

  it('非法 sort 字段 → 退回默认排序，且不破坏表（防注入）', async () => {
    const res = await request.get(BASE).query({ customer: C, sort: 'id; DROP TABLE customer_materials' })
    assert.equal(res.status, 200, '非法排序字段不应 500')
    assert.equal(codes(res), 'S-4,S-1,S-3,S-2', '应退回默认日期倒序')
    const again = await request.get(BASE).query({ customer: C })
    assert.equal(again.body.data.total, 4, '表应完好无损')
  })

  it('排序与筛选可叠加', async () => {
    const res = await request.get(BASE).query({ customer: C, factory: 'B厂', sort: 'price', order: 'desc' })
    assert.equal(res.body.data.total, 1)
    assert.equal(res.body.data.list[0].customer_code, 'S-2')
  })
})

describe('GET /api/materials — 排序边界（非数字 / 空值 / 状态业务序）', () => {
  const C2 = '排序边界客户'
  const SEED2 = [
    // 报价带货币符号、成本价带千分位：都得按数值排，不能被悄悄折成 0
    { customer_code: 'N-1', material_name: 'BBB', price: '￥100', cost_price: '1,000', status: '送样', date: '2026-01-01' },
    // 物料名称为空：升序时不能挤到第一屏
    { customer_code: 'N-2', material_name: '', price: '9', cost_price: '50', status: '报价', date: '2026-01-02' },
    // 压根不是数字：只能沉底，不能 CAST 成 0（否则会排到 9 前面）
    { customer_code: 'N-3', material_name: 'AAA', price: '面议', cost_price: '1.5~2', status: '下批量', date: '2026-01-03' },
    { customer_code: 'N-4', material_name: 'CCC', price: '', cost_price: '', status: '下散单', date: '2026-01-04' }
  ]

  before(async () => {
    for (const s of SEED2) {
      const res = await request.post(BASE).send({ customer: C2, ...s })
      assert.equal(res.body.code, 0, `种子数据应写入成功: ${res.body.msg || res.status}`)
      testIds.push(res.body.data.id)
    }
  })

  const codes = (res) => res.body.data.list.map(r => r.customer_code).join(',')
  // 沉底的两条之间谁先谁后由 id 定，跟被测逻辑无关 —— 断言时排序后比较，只看「是不是这两个」
  const bottom2 = (res) => res.body.data.list.slice(2).map(r => r.customer_code).sort()

  it('报价「￥100」按 100 排（不是按 0，否则会排到「9」前面）', async () => {
    const res = await request.get(BASE).query({ customer: C2, sort: 'price', order: 'asc' })
    assert.equal(codes(res).split(',').slice(0, 2).join(','), 'N-2,N-1', '9 在前、￥100 随后')
  })

  it('成本价「1,000」按 1000 排（不是按 1）', async () => {
    const res = await request.get(BASE).query({ customer: C2, sort: 'cost_price', order: 'asc' })
    assert.equal(codes(res).split(',').slice(0, 2).join(','), 'N-2,N-1', '50 在前、1,000 随后')
  })

  it('不是数字的报价（「面议」）升降序都沉底，不会被当成 0', async () => {
    for (const order of ['asc', 'desc']) {
      const res = await request.get(BASE).query({ customer: C2, sort: 'price', order })
      assert.deepEqual(bottom2(res), ['N-3', 'N-4'], `${order}: 「面议」和空报价应在最后两名`)
    }
  })

  it('空物料名称升序时沉底（不再挤满第一屏，与数值列同一策略）', async () => {
    const res = await request.get(BASE).query({ customer: C2, sort: 'material_name', order: 'asc' })
    assert.equal(res.body.data.list[0].customer_code, 'N-3', 'AAA 应排最前')
    assert.equal(res.body.data.list.at(-1).customer_code, 'N-2', '空名称应排最后')
  })

  it('状态列按业务流转顺序排，不是按汉字编码', async () => {
    const res = await request.get(BASE).query({ customer: C2, sort: 'status', order: 'asc' })
    // 业务序：报价0 → 送样2 → 下散单3 → 下批量4
    // 若按汉字编码则是 下批量(N-3) → 下散单(N-4) → 报价(N-2) → 送样(N-1)，与本断言完全不同
    assert.equal(codes(res), 'N-2,N-1,N-4,N-3')
  })
})

describe('PUT /api/materials/:id — 编辑防重复', () => {
  it('编辑改编码撞上同客户已有编码 → 拦截', async () => {
    const res = await request.put(`${BASE}/${testIds[0]}`).send({ customer_code: 'CUS-002' })
    assert.equal(res.status, 400, '编辑撞重应 400')
    assert.ok(res.body.msg?.includes('客户物料编码 CUS-002'), `应提示撞重: ${res.body.msg}`)
  })

  it('编辑不改编码 → 允许（排除自身）', async () => {
    const res = await request.put(`${BASE}/${testIds[0]}`).send({ material_name: '改名' })
    assert.equal(res.body.code, 0, '编辑自身不触发重复')
  })
})

describe('PUT /api/materials/:id — 改客户名时物料清单跟着改名', () => {
  it('新目录里不留顶着旧客户名的清单，且当场就改（不等下次启动）', async () => {
    const A = await import('../server/src/utils/customerArchive.js')
    const OLD = '甲改名测试', NEW = '乙改名测试'

    const created = await request.post(BASE).send({ customer: OLD, material_name: 'X', status: '报价' })
    const id = created.body.data.id
    testIds.push(id)

    // 归档目录里先摆一份清单，文件名按旧客户名（这就是改名前的正常状态）
    const oldDir = A.customerDirAbs(OLD)
    fs.mkdirSync(oldDir, { recursive: true })
    fs.writeFileSync(path.join(oldDir, A.archiveListName(OLD)), 'x')

    const res = await request.put(`${BASE}/${id}`).send({ customer: NEW })
    assert.equal(res.body.code, 0, `改名应成功: ${res.body.msg}`)

    const newDir = A.customerDirAbs(NEW)
    assert.ok(fs.existsSync(path.join(newDir, A.archiveListName(NEW))), '清单应跟着改成新客户名')
    assert.ok(!fs.existsSync(path.join(newDir, A.archiveListName(OLD))), '不该留下顶着旧客户名的清单')
  })
})
