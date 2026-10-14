/**
 * 客户名册管理（删除 / 合并）— 集成测试
 *
 * 要证明的核心一件事：**删了就是真的没了，合并了就是全都跟着改**。
 *
 * 背景（2026-10-14 祥哥实际踩到的）：客户列表是「名册 ∪ 客户物料 ∪ 报价的首次询价客户
 * ∪ 记事 ∪ 地图」的**并集**。当时名册里冒出「国润」「图科、」这类手打简写，
 * 而界面上没有任何地方能删。真正的原因是：**只删名册没用** —— 源头（报价记录）还写着它，
 * 页面照样显示，下次启动回填还会把它补回名册。
 *
 * 所以这里四条正路 + 四条反路都要钉住：
 *   ① 零引用的名册条目：能删，删完名册和页面并集都没有了
 *   ② 有引用的名字：删除被拒（409），报文明说是哪张表几条
 *   ③ 合并：来源表引用**全部**改成新名，名册里旧的删掉、新的补上
 *   ④ 回收站里的引用也要一起改 —— 否则恢复一条记录，简写就复活
 *   ⑤ 地图客户唯一约束撞车时整单拒绝（不做部分成功）
 *   ⑥ 参数校验：空名 / 同一个名字
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-custmanage-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server, dbMod, namesMod

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '规格书'), { recursive: true })
  dbMod = await import('../server/src/db.js')
  await dbMod.initDb()
  namesMod = await import('../server/src/utils/customerNames.js')
  const customersRouter = (await import('../server/src/routes/customers.js')).default

  const app = express()
  app.use(express.json())
  app.use('/api/customers', customersRouter)
  app.get('/api/customers/list', (req, res) => {
    const rows = namesMod.listAll(req.query.limit)
    res.json({ code: 0, data: req.query.limit_as_list === '1' ? rows.map(r => r.name) : rows })
  })
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

/** 插一条报价记录（first_inquiry_customer 是报价里的客户名来源） */
function insertQuote(customer, materialName = '测试物料') {
  dbMod.execute(
    `INSERT INTO material_prices (material_code, material_name, first_inquiry_customer, price_with_tax, is_deleted)
     VALUES ('', ?, ?, 1.23, 0)`,
    [materialName, customer]
  )
}
function insertQuoteDeleted(customer) {
  dbMod.execute(
    `INSERT INTO material_prices (material_code, material_name, first_inquiry_customer, price_with_tax, is_deleted)
     VALUES ('', '回收站物料', ?, 1.23, 1)`,
    [customer]
  )
}
function insertMap(name) {
  dbMod.execute(`INSERT OR IGNORE INTO map_customers (name, source) VALUES (?, 'test')`, [name])
}
/** 页面并集里有没有这个名字（和 customerNames.js 的 UNION_SQL 同源） */
async function inUnion(name) {
  const r = await request.get('/api/customers/list?limit_as_list=1')
  return r.body.data.includes(name)
}

describe('客户名册管理 — 删除与合并', () => {
  it('① 零引用的名册条目能删掉，删完名册与页面并集都没有了', async () => {
    namesMod.upsertOne('只用过一次的客户有限公司', 'manual')
    assert.equal(await inUnion('只用过一次的客户有限公司'), true)

    // 预览里应标记为可删
    const m = await request.get('/api/customers/manage?keyword=' + encodeURIComponent('只用过一次'))
    assert.equal(m.body.data.length, 1)
    assert.equal(m.body.data[0].deletable, true)
    assert.equal(m.body.data[0].source, 'manual')

    const del = await request.delete('/api/customers/' + encodeURIComponent('只用过一次的客户有限公司'))
    assert.equal(del.status, 200, del.body.msg)
    assert.equal(await inUnion('只用过一次的客户有限公司'), false)
  })

  it('② 有引用的名字：删除被拒，报文点明是哪张表几条', async () => {
    namesMod.upsertOne('被报价引用的简写', 'sync')
    insertQuote('被报价引用的简写')

    const del = await request.delete('/api/customers/' + encodeURIComponent('被报价引用的简写'))
    assert.equal(del.status, 409)
    assert.match(del.body.msg, /报价记录 1 条/)
    assert.equal(del.body.data.refs.quotes, 1)
    // 拒绝之后必须**什么都没动**
    assert.equal(await inUnion('被报价引用的简写'), true)
  })

  it('③ 合并：来源引用全改、名册旧的删掉新的补上', async () => {
    namesMod.upsertOne('国润', 'sync')
    insertQuote('国润')
    insertQuote('国润')
    insertQuote('国润')
    assert.equal(await inUnion('国润'), true)

    const pre = await request.post('/api/customers/merge-preview').send({ from: '国润', to: '深圳市国润聚源科技有限公司' })
    assert.equal(pre.status, 200)
    assert.equal(pre.body.data.total, 3)
    assert.equal(pre.body.data.conflicts.length, 0)

    const mg = await request.post('/api/customers/merge').send({ from: '国润', to: '深圳市国润聚源科技有限公司' })
    assert.equal(mg.status, 200, mg.body.msg)

    assert.equal(await inUnion('国润'), false, '合并后并集里不该再有简写')
    assert.equal(await inUnion('深圳市国润聚源科技有限公司'), true, '全名必须在并集里')
    // 名册里：旧的没了、新的有了
    const m = await request.get('/api/customers/manage?keyword=' + encodeURIComponent('国润'))
    assert.deepEqual(m.body.data.map(x => x.name), ['深圳市国润聚源科技有限公司'])
    // 报价记录里 3 条都改了
    const cnt = dbMod.queryOne(`SELECT COUNT(*) AS c FROM material_prices WHERE first_inquiry_customer = ?`, ['深圳市国润聚源科技有限公司'])
    assert.equal(cnt.c, 3)
  })

  it('④ 回收站里的引用也要一起改（否则恢复记录 ⇒ 简写复活）', async () => {
    namesMod.upsertOne('乐众云、', 'sync')
    insertQuote('乐众云、')
    insertQuoteDeleted('乐众云、')

    const mg = await request.post('/api/customers/merge').send({ from: '乐众云、', to: '深圳市乐众云科技有限公司' })
    assert.equal(mg.status, 200, mg.body.msg)
    const left = dbMod.queryOne(`SELECT COUNT(*) AS c FROM material_prices WHERE first_inquiry_customer = ?`, ['乐众云、'])
    assert.equal(left.c, 0, '连回收站里那条也要改掉')
    const moved = dbMod.queryOne(`SELECT COUNT(*) AS c FROM material_prices WHERE first_inquiry_customer = ?`, ['深圳市乐众云科技有限公司'])
    assert.equal(moved.c, 2)
  })

  it('⑤ 地图客户唯一约束撞车：整单拒绝，不做部分成功', async () => {
    namesMod.upsertOne('撞车简写', 'sync')
    insertMap('撞车简写')
    insertMap('撞车全名有限公司')
    insertQuote('撞车简写')

    const mg = await request.post('/api/customers/merge').send({ from: '撞车简写', to: '撞车全名有限公司' })
    assert.equal(mg.status, 409)
    assert.match(mg.body.msg, /唯一约束/)
    // 关键：拒绝即**什么都没改**（报价记录还是简写，名册里也还在）
    const q = dbMod.queryOne(`SELECT COUNT(*) AS c FROM material_prices WHERE first_inquiry_customer = ?`, ['撞车简写'])
    assert.equal(q.c, 1, '被拒绝时不该动报价记录')
    assert.equal(await inUnion('撞车简写'), true)
  })

  it('⑥ 参数校验：空名 / 同名 / 名册里没有的名字', async () => {
    let r = await request.post('/api/customers/merge').send({ from: '', to: 'X' })
    assert.equal(r.status, 400)
    r = await request.post('/api/customers/merge').send({ from: '甲', to: '甲' })
    assert.equal(r.status, 400)
    r = await request.delete('/api/customers/' + encodeURIComponent('名册里没有的名字'))
    assert.equal(r.status, 404)
  })

  it('⑦ 合并到「本来不存在的全名」也会把全名补进名册（供后续联想）', async () => {
    namesMod.upsertOne('高起乐、', 'sync')
    insertQuote('高起乐、')
    const mg = await request.post('/api/customers/merge').send({ from: '高起乐、', to: '上海高起乐实业有限公司' })
    assert.equal(mg.status, 200, mg.body.msg)
    assert.equal(await inUnion('上海高起乐实业有限公司'), true)
    const inRegistry = dbMod.queryOne('SELECT COUNT(*) AS c FROM customers WHERE name = ?', ['上海高起乐实业有限公司'])
    assert.equal(inRegistry.c, 1)
  })
})
