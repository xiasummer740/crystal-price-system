/**
 * 客户名统一名册 — 跨模块可见性集成测试
 *
 * 要证明的一件事：**在任何一个页面录进去的客户名，其他所有页面的联想/下拉都能搜到。**
 *
 * 背景（实测过的老问题）：客户名散在 5 张表里，各页面各读各的 ——
 * 在「客户物料」建的客户，「记事」「客户地图」搜不到（反之亦然）。
 * 存量数据当时两边差了 69 个名字。
 *
 * 覆盖：
 *   ① 客户物料新建 → 记事/统一接口都能搜到
 *   ② 记事新建     → 客户物料/统一接口都能搜到
 *   ③ 报价新建     → 能搜到（「初次询价客户」也是客户名来源）
 *   ④ 地图新建     → 能搜到
 *   ⑤ 客户改名     → 新名字能搜到
 *   ⑥ 存量回填     → 直接写进各表、绕过接口的旧数据，syncFromAllTables() 能补进名册
 *   ⑦ 名册只记名字、不重复（幂等）
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-custnames-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server
let namesMod, dbMod

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '规格书'), { recursive: true })
  dbMod = await import('../server/src/db.js')
  await dbMod.initDb()
  namesMod = await import('../server/src/utils/customerNames.js')

  const materialsRouter = (await import('../server/src/routes/materials.js')).default
  const notesRouter = (await import('../server/src/routes/notes.js')).default
  const pricesRouter = (await import('../server/src/routes/prices.js')).default
  const mapRouter = (await import('../server/src/routes/map.js')).default

  const app = express()
  app.use(express.json())
  app.use('/api/materials', materialsRouter)
  app.use('/api/notes', notesRouter)
  app.use('/api/prices', pricesRouter)
  app.use('/api/map', mapRouter)
  // 与 server/src/index.js 里的定义保持一致
  app.get('/api/customers/suggest', (req, res) => {
    res.json({ code: 0, data: namesMod.resolveSuggest(req.query.keyword, req.query.limit) })
  })
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

/** 各页面实际用的那几个读接口 —— 全部要在同一个名字上给出「搜得到」 */
async function visibleEverywhere(name) {
  const kw = encodeURIComponent(name)
  const [mSearch, nSearch, nList, mList, uSuggest, uList] = await Promise.all([
    request.get(`/api/materials/customers/search?keyword=${kw}`),
    request.get(`/api/notes/customers/search?keyword=${kw}`),
    request.get('/api/notes/customers/list'),
    request.get('/api/materials/customers/list'),
    request.get(`/api/customers/suggest?keyword=${kw}`),
    request.get('/api/customers/list?limit_as_list=1')
  ])
  return {
    '客户物料页 搜索': mSearch.body.data.some(x => x.name === name),
    '记事页     搜索': nSearch.body.data.some(x => x.name === name),
    '记事页     下拉': nList.body.data.includes(name),
    '客户物料页 下拉': mList.body.data.some(x => x.customer === name),
    '统一       搜索': uSuggest.body.data.some(x => x.name === name),
    '统一       下拉': uList.body.data.includes(name)
  }
}

function assertAllVisible(flags, label) {
  const bad = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)
  assert.equal(bad.length, 0, `${label}：这些入口搜不到该客户 → ${bad.join('、')}`)
}

describe('客户名统一名册 — 跨模块可见性', () => {
  it('① 客户物料新建的客户，记事/地图/统一入口都能搜到', async () => {
    const name = '统一测试客户甲'
    const res = await request.post('/api/materials').send({
      date: '2026-01-01', customer: name, customer_code: 'UT-A', jkx_code: 'UT-A',
      material_name: '测试料', price: '1', status: '报价'
    })
    assert.equal(res.body.code, 0, res.body.msg || `HTTP ${res.status}`)
    assertAllVisible(await visibleEverywhere(name), '客户物料新建后')
  })

  it('② 记事新建的客户，客户物料/统一入口都能搜到', async () => {
    const name = '统一测试客户乙'
    const res = await request.post('/api/notes').send({
      title: '测试', content: 'x', customer: name, category_id: 0, images: [], priority: 2, status: 'todo'
    })
    assert.equal(res.body.code, 0, res.body.msg || `HTTP ${res.status}`)
    assertAllVisible(await visibleEverywhere(name), '记事新建后')
  })

  it('③ 报价记录新建的「初次询价客户」也能搜到', async () => {
    const name = '统一测试客户丙'
    const res = await request.post('/api/prices').send({
      material_code: 'UT-C', material_name: '测试料C', first_inquiry_customer: name
    })
    assert.equal(res.body.code, 0, res.body.msg || `HTTP ${res.status}`)
    assertAllVisible(await visibleEverywhere(name), '报价新建后')
  })

  it('④ 客户地图新建的客户也能搜到', async () => {
    const name = '统一测试客户丁'
    const res = await request.post('/api/map/customers').send({ name, phone: '123' })
    assert.equal(res.body.code, 0, res.body.msg || `HTTP ${res.status}`)
    assertAllVisible(await visibleEverywhere(name), '地图新建后')
  })

  it('⑤ 客户改名后，新名字也能被所有入口搜到', async () => {
    const oldName = '统一测试改名前'
    const newName = '统一测试改名后'
    const created = await request.post('/api/materials').send({
      date: '2026-01-01', customer: oldName, customer_code: 'UT-R', jkx_code: 'UT-R',
      material_name: '改名用', price: '1', status: '报价'
    })
    const id = created.body.data.id
    const res = await request.put(`/api/materials/${id}`).send({
      date: '2026-01-01', customer: newName, customer_code: 'UT-R', jkx_code: 'UT-R',
      material_name: '改名用', price: '1', status: '报价'
    })
    assert.equal(res.body.code, 0, res.body.msg || `HTTP ${res.status}`)
    assertAllVisible(await visibleEverywhere(newName), '改名后')
  })

  it('⑥ 绕过接口直写的存量数据，syncFromAllTables() 能补进名册', async () => {
    // 模拟"老数据"：直接写进各表，不走接口（等于历史上那些没写名册的入口）
    dbMod.execute("INSERT INTO customer_materials (customer, date, material_code, material_name) VALUES (?,?,?,?)", ['存量客户一', '2020-01-01', 'OLD1', '老料'])
    dbMod.execute("INSERT INTO notes (title, content, customer) VALUES (?,?,?)", ['老记事', 'x', '存量客户二'])
    dbMod.execute("INSERT INTO map_customers (name) VALUES (?)", ['存量客户三'])
    dbMod.execute("INSERT INTO material_prices (material_code, material_name, first_inquiry_customer) VALUES (?,?,?)", ['OLD2', '老报价料', '存量客户四'])

    const added = namesMod.syncFromAllTables()
    assert.ok(added >= 4, `应至少补进 4 个存量客户名，实际 ${added}`)
    for (const n of ['存量客户一', '存量客户二', '存量客户三', '存量客户四']) {
      assertAllVisible(await visibleEverywhere(n), `回填后（${n}）`)
    }
  })

  it('⑦ 名册幂等：重复回填不会补第二次', async () => {
    const again = namesMod.syncFromAllTables()
    assert.equal(again, 0, `第二次回填应为 0，实际 ${again}`)
  })

  it('⑧ 名册不会把空名/纯空白写进去', () => {
    const before = namesMod.listAll().length
    namesMod.upsertMany(['', '   ', null, undefined], 'test')
    assert.equal(namesMod.listAll().length, before, '空名不应产生新条目')
  })

  it('⑨ 名字前后空白会被归一（避免「 客户A」和「客户A」变成两个）', async () => {
    namesMod.upsertMany(['  归一测试客户  '], 'test')
    const rows = namesMod.resolveSuggest('归一测试客户')
    assert.ok(rows.some(r => r.name === '归一测试客户'), `应归一为无空白的名字，实际 ${JSON.stringify(rows.map(r => r.name))}`)
  })
})
