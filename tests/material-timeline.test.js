/**
 * 物料进展时间线 + 记事关联物料 — 集成测试
 *
 * 两条需求（祥哥 2026-10-14）：
 *   ① 「之前最早的记录是报价或送样，后面发了规格书、价格更新、下散单、下批量，
 *      改完只看到最后的结果，完全不知道之前的进度」⇒ 要有**只追加**的进展流水 + 把
 *      已有的报价/改价/送样/规格书聚合成一条时间线；
 *   ② 「某个客户的记事里记某物料下单多少、备货多少、什么物料要送样」⇒ 记事里能**显式关联**
 *      该客户的物料（带动作 + 数量），并且**只有被关联的**那条记事才进物料时间线。
 *
 * 这里钉住的几条关键行为：
 *   - 建档写 created；状态/价格/成本价/规格书**真变了才写**（没变不产生噪声）
 *   - 报价记录按「同客户 + 料号精确匹配」进时间线；改价读 price_logs（old→new）
 *   - 送样按料号/名匹配进时间线
 *   - **未关联的记事不进**时间线；关联的进，且带出动作+数量
 *   - 短物料名（<8 字）不靠「包含」误吞（否则「3225」会把半个报价库吸进来）
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-timeline-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server, dbMod

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '规格书'), { recursive: true })
  dbMod = await import('../server/src/db.js')
  await dbMod.initDb()

  const materialsRouter = (await import('../server/src/routes/materials.js')).default
  const notesRouter = (await import('../server/src/routes/notes.js')).default
  const pricesRouter = (await import('../server/src/routes/prices.js')).default

  const app = express()
  app.use(express.json())
  app.use('/api/materials', materialsRouter)
  app.use('/api/notes', notesRouter)
  app.use('/api/prices', pricesRouter)
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

const CUSTOMER = '测试客户甲有限公司'
const LONG_NAME = '5032,4pin,27.120MHz,10PF,±10ppm,60Ω'

// ⚠️ 客户物料的「客户物料编码/晶科鑫料号」在同客户下是唯一的（有防重复拦截），
//    所以每个用例都用各自的编码 —— 否则第二个 createMaterial 会被 400 挡住。
let seq = 0
/** 建一个客户物料，返回 id */
async function createMaterial(extra = {}) {
  seq++
  const tag = String(seq).padStart(3, '0')
  const r = await request.post('/api/materials').send({
    customer: CUSTOMER, date: '2026-05-01',
    customer_code: `C-${tag}`,
    jkx_code: `J-${tag}`,
    material_name: LONG_NAME, factory: 'SJK', status: '报价', price: '0.6', cost_price: '0.5',
    ...extra
  })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body.data.id
}
async function timeline(id) {
  const r = await request.get(`/api/materials/${id}/timeline`)
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body.data
}
const kinds = (tl) => tl.items.map(i => i.kind)
const findItem = (tl, pred) => tl.items.find(pred)

describe('物料进展时间线', () => {
  it('① 建档就写一条 created（时间线的第一项）', async () => {
    const id = await createMaterial()
    const tl = await timeline(id)
    const created = findItem(tl, i => i.type === 'created')
    assert.ok(created, '要有 created 流水')
    assert.equal(created.new_value, '报价')
    assert.equal(created.note, '建档')
  })

  it('② 状态流转写一条 status（带 old→new）；状态没变就不写', async () => {
    const id = await createMaterial()
    // 改状态
    await request.put(`/api/materials/${id}`).send({ status: '规格书' })
    let tl = await timeline(id)
    const st = tl.items.filter(i => i.type === 'status')
    assert.equal(st.length, 1, '只该有一条状态流水')
    assert.equal(st[0].old_value, '报价')
    assert.equal(st[0].new_value, '规格书')
    // 再改回同样的状态（别的字段动一下）→ 不该多出状态流水
    await request.put(`/api/materials/${id}`).send({ status: '规格书', remark: '只改备注' })
    tl = await timeline(id)
    assert.equal(tl.items.filter(i => i.type === 'status').length, 1, '状态没变就不该写')
  })

  it('③ 报价/成本价变化各写一条流水（能看出从多少改到多少）', async () => {
    const id = await createMaterial()
    await request.put(`/api/materials/${id}`).send({ price: '0.55', cost_price: '0.45' })
    const tl = await timeline(id)
    const price = findItem(tl, i => i.type === 'price')
    const cost = findItem(tl, i => i.type === 'cost_price')
    assert.equal(price.old_value, '0.6')
    assert.equal(price.new_value, '0.55')
    assert.equal(cost.old_value, '0.5')
    assert.equal(cost.new_value, '0.45')
  })

  it('④ 聚合：同客户同料号的报价记录 + 每一次改价（price_logs）都进时间线', async () => {
    const id = await createMaterial({ jkx_code: 'J-QUOTE', customer_code: 'C-QUOTE' })
    // 建一条报价（料号与客户物料的 jkx_code 相同）
    const q = await request.post('/api/prices').send({
      material_code: 'J-QUOTE', material_name: LONG_NAME, material_spec: '5032',
      first_inquiry_customer: CUSTOMER, price_with_tax: 0.452, price_without_tax: 0.4, quoter: '小清'
    })
    assert.equal(q.status, 200, JSON.stringify(q.body))
    // 再改一次价 → prices 路由会写 price_logs
    await request.put(`/api/prices/${q.body.data.id}`).send({ price_with_tax: 0.4746 })

    const tl = await timeline(id)
    assert.ok(kinds(tl).includes('quote'), '报价记录要进时间线')
    const change = findItem(tl, i => i.kind === 'price_log' && i.field === 'price_with_tax')
    assert.ok(change, '改价明细要进时间线')
    assert.equal(change.old_value, '0.452')
    assert.equal(change.new_value, '0.4746')
    assert.equal(change.note, '含税价', '字段名要翻译成人话')
  })

  it('⑤ 短物料名不靠「包含」误吞（避免把半个报价库吸进来）', async () => {
    // 物料名只有「3225」（4 个字）；报价里那条叫「3225,4pin,40MHz…」——不该被匹配上
    const id = await createMaterial({ material_name: '3225', jkx_code: '', customer_code: '', material_code: '' })
    await request.post('/api/prices').send({
      material_code: 'OTHER-CODE', material_name: '3225,4pin,40.000MHz,12pF', first_inquiry_customer: CUSTOMER, price_with_tax: 1.0
    })
    const tl = await timeline(id)
    assert.equal(tl.items.filter(i => i.kind === 'quote').length, 0, '短名不该命中')
  })

  it('⑥ 送样（样品登记）按料号匹配进时间线', async () => {
    const id = await createMaterial({ jkx_code: 'J-SAMPLE', customer_code: 'C-SAMPLE' })
    dbMod.execute(
      `INSERT INTO material_samples (material_code, material_name, factory_code, stock_quantity) VALUES (?, ?, ?, ?)`,
      ['J-SAMPLE', LONG_NAME, '370', 2000]
    )
    const tl = await timeline(id)
    const sample = findItem(tl, i => i.kind === 'sample')
    assert.ok(sample, '送样要进时间线')
    assert.match(sample.note, /送样登记/)
    assert.equal(sample.new_value, '2000')
  })
})

describe('记事关联物料', () => {
  it('⑦ 记事能存下关联物料（含动作/数量），读回来是数组', async () => {
    const id = await createMaterial()
    const n = await request.post('/api/notes').send({
      title: '下单备货', content: '按客户要求先备货', customer: CUSTOMER,
      material_refs: [
        { material_id: id, name: LONG_NAME, jkx_code: 'J-SNAP', action: '下单', quantity: '5000', unit: 'PCS' },
        { material_id: id, name: LONG_NAME, action: '备货', quantity: '3000' },
        { material_id: 0, name: '', action: '下单', quantity: '999' }   // 空壳 → 应被丢弃
      ]
    })
    assert.equal(n.status, 200, JSON.stringify(n.body))
    const detail = await request.get(`/api/notes/${n.body.data.id}`)
    assert.equal(detail.body.data.material_refs.length, 2, '空壳那条要被丢掉')
    assert.equal(detail.body.data.material_refs[0].action, '下单')
    assert.equal(detail.body.data.material_refs[0].quantity, '5000')
    assert.equal(detail.body.data.material_refs[0].unit, 'PCS')
  })

  it('⑧ 只有被关联的记事进物料时间线，别的记事一概不进', async () => {
    const id = await createMaterial()
    // 无关记事（同客户、没关联物料）
    await request.post('/api/notes').send({ title: '闲聊', content: '客户换了采购', customer: CUSTOMER })
    // 关联到该物料的记事
    await request.post('/api/notes').send({
      title: '要送样', content: '客户要 5 片样品', customer: CUSTOMER,
      material_refs: [{ material_id: id, name: LONG_NAME, action: '送样', quantity: '5', unit: '片' }]
    })
    const tl = await timeline(id)
    const notes = tl.items.filter(i => i.kind === 'note')
    assert.equal(notes.length, 1, '只该有 1 条记事进时间线')
    assert.equal(notes[0].source, '记事')
    assert.match(notes[0].note, /送样/)
    assert.match(notes[0].note, /5片/)
    assert.equal(tl.items.some(i => i.note.includes('闲聊')), false, '无关记事不该出现')
  })

  it('⑨ 别的物料的关联记事不会串到本物料上', async () => {
    const a = await createMaterial({ jkx_code: 'CODE-A', customer_code: 'A', material_name: '物料A型号长名字' })
    const b = await createMaterial({ jkx_code: 'CODE-B', customer_code: 'B', material_name: '物料B型号长名字' })
    await request.post('/api/notes').send({
      title: 'B的下单', customer: CUSTOMER,
      material_refs: [{ material_id: b, name: '物料B型号长名字', action: '下单', quantity: '100' }]
    })
    const tlA = await timeline(a)
    assert.equal(tlA.items.filter(i => i.kind === 'note').length, 0, 'A 的时间线里不该有 B 的记事')
    const tlB = await timeline(b)
    assert.equal(tlB.items.filter(i => i.kind === 'note').length, 1)
  })
})
