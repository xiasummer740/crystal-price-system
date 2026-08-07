/**
 * Prices API 集成测试
 *
 * 测试 CRUD 核心路径：列表 → 新增 → 查询 → 编辑 → 软删除
 * 使用临时数据目录，不影响真实数据
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-api-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server
const BASE = '/api/prices'
let testIds = []

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  const dbMod = await import('../server/src/db.js')
  await dbMod.initDb()

  const pricesRouter = (await import('../server/src/routes/prices.js')).default
  const app = express()
  app.use(express.json())
  app.use(BASE, pricesRouter)
  app.use((err, _req, res, _next) => {
    res.status(500).json({ code: 1, msg: err.message })
  })
  server = app.listen(0)
  const { default: supertest } = await import('supertest')
  request = supertest(server)
})

after(async () => {
  // 等自动保存 debounce 完成后再清理
  await new Promise(r => setTimeout(r, 500))
  try { server?.close() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('POST /api/prices — 新增记录', () => {

  it('新增一条完整记录', async () => {
    const res = await request.post(BASE).send({
      material_code: 'TEST-001',
      material_name: '32.768KHz 晶振测试',
      material_spec: '3.2x1.5mm',
      category: '无源晶振',
      brand: 'KDS',
      price_with_tax: 0.35,
      currency: 'USD',
      factory_code: 'KDS-001',
      quoter: '张三',
      first_inquiry_customer: '华为'
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.code, 0)
    assert.ok(res.body.data?.id > 0, '应返回新记录 ID')
    testIds.push(res.body.data.id)
  })

  it('缺失字段也能插入（无强校验）', async () => {
    const res = await request.post(BASE).send({
      material_name: '只有名称的记录'
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.code, 0, 'API 不做必填校验，缺失字段用空字符串填充')
    testIds.push(res.body.data.id)
  })

  it('新增另一条记录', async () => {
    const res = await request.post(BASE).send({
      material_code: 'TEST-002',
      material_name: '26MHz 温补晶振',
      brand: 'NDK',
      price_with_tax: 2.50,
      currency: 'USD',
      factory_code: 'NDK-01',
      quoter: '李四',
      first_inquiry_customer: '中兴'
    })
    assert.equal(res.body.code, 0)
    testIds.push(res.body.data.id)
  })

  it('新增第三条含全部字段', async () => {
    const res = await request.post(BASE).send({
      material_code: 'TEST-003',
      material_name: '16MHz 晶振',
      material_spec: '5.0x3.2mm',
      category: '无源晶振',
      brand: 'EPSON',
      dimension: '5.0x3.2mm',
      frequency: '16MHz',
      price_with_tax: 0.18,
      price_without_tax: 0.15,
      currency: 'USD',
      factory_code: 'EPSON-01',
      quoter: '王五',
      standard_lead_time: '4周',
      first_inquiry_customer: '小米',
      remarks: '测试备注'
    })
    assert.equal(res.body.code, 0)
    testIds.push(res.body.data.id)
  })

})

describe('GET /api/prices — 查询列表', () => {

  it('列表返回所有记录和总数', async () => {
    const res = await request.get(BASE)
    assert.equal(res.status, 200)
    assert.equal(res.body.code, 0)
    assert.ok(res.body.data?.list?.length >= 3, `应有至少3条, 实际 ${res.body.data?.list?.length}`)
    assert.ok(res.body.data?.total >= 3)
  })

  it('关键词搜索', async () => {
    const res = await request.get(`${BASE}?keyword=32.768KHz`)
    assert.equal(res.body.code, 0)
    assert.ok(res.body.data.list.length >= 1)
    assert.equal(res.body.data.list[0].material_code, 'TEST-001')
  })

  it('按 factory_code 筛选', async () => {
    const res = await request.get(`${BASE}?factory=NDK-01`)
    assert.equal(res.body.code, 0)
    assert.ok(res.body.data.list.every(r => r.factory_code === 'NDK-01'))
  })

  it('分页参数生效', async () => {
    const res = await request.get(`${BASE}?page=1&pageSize=2`)
    assert.equal(res.body.code, 0)
    assert.ok(res.body.data.list.length <= 2)
    assert.ok(res.body.data.total >= 3)
  })

})

describe('GET /api/prices/:id — 获取单条', () => {

  it('按 ID 查询返回正确记录', async () => {
    const res = await request.get(`${BASE}/${testIds[0]}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.code, 0)
    assert.equal(res.body.data.material_code, 'TEST-001')
    assert.equal(res.body.data.id, testIds[0])
  })

  it('不存在的 ID 返回 404', async () => {
    const res = await request.get(`${BASE}/99999`)
    assert.equal(res.status, 404, '不存在应返回 404')
    assert.equal(res.body.code, 1)
    assert.ok(res.body.msg?.includes('不存在'), '应有提示信息')
  })

})

describe('PUT /api/prices/:id — 编辑记录', () => {

  it('更新价格和报价人', async () => {
    const res = await request.put(`${BASE}/${testIds[0]}`).send({
      price_with_tax: 0.55,
      quoter: '赵六'
    })
    assert.equal(res.body.code, 0)
    assert.equal(res.body.msg, '更新成功')

    // 验证更新
    const check = await request.get(`${BASE}/${testIds[0]}`)
    assert.equal(check.body.data.price_with_tax, 0.55)
    assert.equal(check.body.data.quoter, '赵六')
  })

})

describe('DELETE /api/prices/:id — 软删除', () => {

  it('删除后列表查询不再包含', async () => {
    // 删除
    const res = await request.delete(`${BASE}/${testIds[2]}`)
    assert.equal(res.body.code, 0)

    // 列表验证
    const list = await request.get(BASE)
    const deleted = list.body.data.list.find(r => r.id === testIds[2])
    assert.equal(deleted, undefined, '已删除记录不应出现在列表中')
  })

})

describe('GET /api/prices/meta/options — 筛选选项', () => {

  it('返回工厂和报价人列表', async () => {
    const res = await request.get(`${BASE}/meta/options`)
    assert.equal(res.status, 200)
    assert.equal(res.body.code, 0)
    assert.ok(res.body.data?.factories?.length >= 1, '应有工厂列表')
    assert.ok(res.body.data?.quoters?.length >= 1, '应有报价人列表')
  })

})

describe('POST /api/prices — 防重复/防参数不一致拦截', () => {
  const base = {
    material_code: 'DUP-001',
    material_name: '重复测试晶振',
    material_spec: 'SMD3225',
    category: '无源晶振',
    brand: 'TXC',
    dimension: '3225',
    pin_count: '4PIN',
    frequency: '32.768KHz',
    load_cap: '12.5pF',
    voltage: '3.3V',
    mode: 'CMOS',
    freq_tol: '20ppm',
    temperature: '-40~85℃'
  }

  it('首条同编码记录新增成功', async () => {
    const res = await request.post(BASE).send({ ...base, price_with_tax: 0.8, currency: 'USD', factory_code: 'TXC-01', quoter: '张三' })
    assert.equal(res.body.code, 0, `首条应新增成功, 实际: ${res.body.msg || res.status}`)
    testIds.push(res.body.data.id)
  })

  it('同编码不同工厂/价格 → 允许（整合进一条产品）', async () => {
    const res = await request.post(BASE).send({ ...base, price_with_tax: 0.9, currency: 'USD', factory_code: 'TXC-02', quoter: '李四' })
    assert.equal(res.status, 200)
    assert.equal(res.body.code, 0, '同编码不同工厂/价格应允许新增')
    testIds.push(res.body.data.id)
  })

  it('同编码技术参数不一致 → 拦截', async () => {
    const res = await request.post(BASE).send({ ...base, load_cap: '20pF', price_with_tax: 1.0, factory_code: 'TXC-03', quoter: '王五' })
    assert.equal(res.status, 400, '参数不一致应返回 400')
    assert.ok(res.body.msg?.includes('技术参数不一致'), `应提示参数不一致, 实际: ${res.body.msg}`)
  })

  it('完全相同的记录 → 拦截', async () => {
    const res = await request.post(BASE).send({ ...base, price_with_tax: 0.8, currency: 'USD', factory_code: 'TXC-01', quoter: '张三' })
    assert.equal(res.status, 400, '完全重复应返回 400')
    assert.ok(res.body.msg?.includes('完全相同的记录'), `应提示完全重复, 实际: ${res.body.msg}`)
  })

  it('空编码完全重复 → 拦截', async () => {
    await request.post(BASE).send({ material_name: '空编码重复测试' })
    const res = await request.post(BASE).send({ material_name: '空编码重复测试' })
    assert.equal(res.status, 400, '空编码完全重复应拦截')
    assert.ok(res.body.msg?.includes('完全相同的记录'))
  })

})

describe('POST /api/prices — 备注图片 remark_images', () => {
  it('保存 remark_images 数组并能读回、编辑更新', async () => {
    const res = await request.post(BASE).send({
      material_code: 'IMG-001',
      material_name: '带图片备注测试',
      remarks: '原始报价截图',
      remark_images: ['/api/uploads/prices/1-test.png', '/api/uploads/prices/2-a.pdf?name=a.pdf']
    })
    assert.equal(res.body.code, 0, `新增应成功: ${res.body.msg || res.status}`)
    const id = res.body.data.id

    // 读回：存的是 JSON 字符串，解析后是数组
    const check = await request.get(`${BASE}/${id}`)
    const arr = JSON.parse(check.body.data.remark_images || '[]')
    assert.equal(arr.length, 2, '应保存 2 个图片')
    assert.equal(arr[0], '/api/uploads/prices/1-test.png')

    // 编辑：替换 remark_images
    const upd = await request.put(`${BASE}/${id}`).send({ remark_images: ['/api/uploads/prices/3-new.png'] })
    assert.equal(upd.body.code, 0)
    const check2 = await request.get(`${BASE}/${id}`)
    const arr2 = JSON.parse(check2.body.data.remark_images || '[]')
    assert.equal(arr2.length, 1, '编辑后应剩 1 个')
    assert.equal(arr2[0], '/api/uploads/prices/3-new.png')
  })
})
