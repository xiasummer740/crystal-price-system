/**
 * 表单联想接口（/api/suggest）集成测试
 *
 * 覆盖：
 *   - 跨表合并（报价 + 样品）：同一品牌/工厂次数相加
 *   - 已软删除的行不进候选
 *   - 关键字过滤、次数排序、limit
 *   - 物料档案带元数据（名称/规格/工厂），选中料号可直接回填
 *   - 客户物料编码按客户隔离（A 客户的料号不推荐给 B 客户）
 *   - scope / field 白名单：非法值 400（不把参数拼进 SQL）
 *   - LIKE 特殊字符按字面匹配（% _ \）
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-suggest-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server, db

const BASE = '/api/suggest'

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  db = await import('../server/src/db.js')
  await db.initDb()

  const insertPrice = (row) => db.execute(
    `INSERT INTO material_prices (material_code, material_name, material_spec, brand, dimension, pin_count,
      frequency, load_cap, voltage, mode, freq_tol, factory_code, is_deleted)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [row.code, row.name || '', row.spec || '', row.brand || '', row.dimension || '', row.pin_count || '',
      row.frequency || '', row.load_cap || '', row.voltage || '', row.mode || '', row.freq_tol || '',
      row.factory || '', row.deleted ? 1 : 0]
  )
  const insertSample = (row) => db.execute(
    `INSERT INTO material_samples (material_code, material_name, material_spec, brand, dimension, pin_count,
      frequency, load_cap, voltage, mode, freq_tol, factory_code, is_deleted)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [row.code, row.name || '', row.spec || '', row.brand || '', row.dimension || '', row.pin_count || '',
      row.frequency || '', row.load_cap || '', row.voltage || '', row.mode || '', row.freq_tol || '',
      row.factory || '', row.deleted ? 1 : 0]
  )
  const insertCustomerMaterial = (row) => db.execute(
    `INSERT INTO customer_materials (customer, customer_code, jkx_code, material_name, factory, is_deleted)
     VALUES (?,?,?,?,?,?)`,
    [row.customer || '', row.customer_code || '', row.jkx_code || '', row.name || '', row.factory || '', row.deleted ? 1 : 0]
  )

  // 报价：P1 出现两次（SJK/F01），P2 一次（TXC/F02），P3 已删除
  insertPrice({ code: 'P1', name: '32.768K 晶振', spec: '3215', brand: 'SJK', dimension: '3.2x1.5', pin_count: '2', frequency: '32.768KHZ', factory: 'F01' })
  insertPrice({ code: 'P1', name: '32.768K 晶振', spec: '3215', brand: 'SJK', dimension: '3.2x1.5', pin_count: '2', frequency: '32.768KHZ', factory: 'F01' })
  insertPrice({ code: 'P2', name: '8M 晶振', spec: '3225', brand: 'TXC', frequency: '8M', factory: 'F02' })
  insertPrice({ code: 'P3', name: '已删除物料', brand: 'DELETED_BRAND', factory: 'F99', deleted: true })
  // LIKE 转义用：一个值里真的带 %，一个不带
  insertPrice({ code: 'P4', name: '百分号', brand: '100%', factory: 'F04' })
  insertPrice({ code: 'P5', name: '普通', brand: '100X', factory: 'F05' })

  // 样品：P1 再出现一次（次数应合并成 3），S1 只在样品里
  insertSample({ code: 'P1', name: '32.768K 晶振', spec: '3215', brand: 'SJK', dimension: '3.2x1.5', pin_count: '2', frequency: '32.768KHZ', factory: 'F01' })
  insertSample({ code: 'S1', name: '样品独有料', spec: '2016', brand: 'SAMPLE_ONLY', frequency: '32.768KHz', factory: 'F03' })

  // 客户物料：A 客户有两个料号（CA-1 出现两次），B 客户一个（CB-1）；P9 已删
  insertCustomerMaterial({ customer: '客户A', customer_code: 'CA-1', jkx_code: 'P1', name: '32.768K 晶振（客户A叫法）', factory: 'F09' })
  insertCustomerMaterial({ customer: '客户A', customer_code: 'CA-1', jkx_code: 'P1', factory: 'F09' })
  insertCustomerMaterial({ customer: '客户B', customer_code: 'CB-1', jkx_code: 'P9', name: '别的物料', factory: 'F10' })
  insertCustomerMaterial({ customer: '客户B', customer_code: '', jkx_code: 'P8', name: '已删除料号', deleted: true })

  const suggestRouter = (await import('../server/src/routes/suggest.js')).default
  const app = express()
  app.use(express.json())
  app.use(BASE, suggestRouter)
  server = app.listen(0)
  const { default: supertest } = await import('supertest')
  request = supertest(server)
})

after(async () => {
  await new Promise(r => setTimeout(r, 500))
  try { server?.close() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

const get = (url) => request.get(BASE + url)
const find = (arr, value) => arr.find(x => x.value === value)

describe('GET /api/suggest/form?scope=samples', () => {
  it('返回所有字段的候选 + 物料档案', async () => {
    const res = await get('/form?scope=samples')
    assert.equal(res.status, 200)
    assert.equal(res.body.code, 0)
    assert.ok(res.body.data.fields, '应有 fields')
    assert.ok(Array.isArray(res.body.data.codes), '应有 codes')
    for (const f of ['brand', 'dimension', 'frequency', 'factory_code', 'material_code', 'material_name', 'material_spec']) {
      assert.ok(Array.isArray(res.body.data.fields[f]), `字段 ${f} 应有候选数组`)
    }
  })

  it('跨表合并次数：SJK 在报价 2 条 + 样品 1 条 = 3', async () => {
    const res = await get('/form?scope=samples')
    const sj = find(res.body.data.fields.brand, 'SJK')
    assert.ok(sj, '应包含 SJK')
    assert.equal(sj.count, 3, '报价与样品里的次数应相加')
    // 次数多的排前面
    assert.equal(res.body.data.fields.brand[0].value, 'SJK')
  })

  it('已软删除的行不进候选', async () => {
    const res = await get('/form?scope=samples')
    assert.equal(find(res.body.data.fields.brand, 'DELETED_BRAND'), undefined)
    assert.equal(res.body.data.fields.factory_code.some(x => x.value === 'F99'), false)
    assert.equal(res.body.data.codes.some(c => c.code === 'P3'), false)
  })

  it('物料档案带名称/规格/参数（前端选中后可直接回填）', async () => {
    const res = await get('/form?scope=samples')
    const p1 = res.body.data.codes.find(c => c.code === 'P1')
    assert.ok(p1, '应包含料号 P1')
    assert.equal(p1.name, '32.768K 晶振')
    assert.equal(p1.spec, '3215')
    assert.equal(p1.brand, 'SJK')
    assert.equal(p1.dimension, '3.2x1.5')
    assert.equal(p1.frequency, '32.768KHZ')
    assert.equal(p1.factory_code, 'F01')
    assert.equal(p1.count, 3, '同一料号在报价(2)+样品(1)里的次数应合并')
  })

  it('样品独有的料号也在候选里', async () => {
    const res = await get('/form?scope=samples')
    assert.ok(res.body.data.codes.some(c => c.code === 'S1'))
  })
})

describe('GET /api/suggest/field/:field', () => {
  it('按关键字过滤（大小写不敏感）', async () => {
    const res = await get('/field/brand?scope=samples&kw=sj')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.data.map(x => x.value), ['SJK'])
  })

  it('中文关键字过滤物料名称', async () => {
    const res = await get('/field/material_name?scope=samples&kw=晶振')
    const values = res.body.data.map(x => x.value)
    assert.ok(values.includes('32.768K 晶振'))
    assert.ok(values.includes('8M 晶振'))
    assert.ok(!values.includes('样品独有料'))
  })

  it('limit 生效', async () => {
    const res = await get('/field/factory_code?scope=samples&limit=1')
    assert.equal(res.body.data.length, 1)
  })

  it('工厂字段跨表合并（material_prices.factory_code + material_samples.factory_code）', async () => {
    const res = await get('/field/factory_code?scope=samples')
    const f01 = find(res.body.data, 'F01')
    assert.ok(f01)
    assert.equal(f01.count, 3)
  })

  it('% 按字面匹配，不当通配符', async () => {
    const res = await get('/field/brand?scope=samples&kw=' + encodeURIComponent('%'))
    const values = res.body.data.map(x => x.value)
    assert.deepEqual(values, ['100%'], '只有真的带 % 的值该命中，100X 不该被当成通配符匹配进来')
  })

  it('非法 scope 返回 400', async () => {
    const res = await get('/field/brand?scope=../../etc')
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 1)
  })

  it('非法字段返回 400（含注入尝试）', async () => {
    for (const field of ['brand;DROP TABLE material_prices', 'not_a_field', 'id']) {
      const res = await get('/field/' + encodeURIComponent(field) + '?scope=samples')
      assert.equal(res.status, 400, `field=${field} 应被白名单挡住`)
    }
    // 表还在，说明没有把参数拼进 SQL
    const check = await get('/form?scope=samples')
    assert.equal(check.status, 200)
    assert.ok(check.body.data.fields.brand.length > 0)
  })
})

describe('GET /api/suggest/codes', () => {
  it('scope=materials 合并客户物料里的料号与工厂', async () => {
    const res = await get('/codes?scope=materials&kw=P1')
    assert.equal(res.status, 200)
    const p1 = res.body.data.find(c => c.code === 'P1')
    assert.ok(p1, '应包含客户物料里用过的 P1')
    // 名称来自报价表（客户物料里那行叫「32.768K 晶振（客户A叫法）」，两边都该被看到至少一个）
    assert.ok(p1.name)
    assert.ok(p1.count >= 2)
  })

  it('关键字也能按物料名称搜', async () => {
    const res = await get('/codes?scope=samples&kw=' + encodeURIComponent('样品独有'))
    assert.deepEqual(res.body.data.map(c => c.code), ['S1'])
  })

  it('已删除的客户物料料号不出现', async () => {
    const res = await get('/codes?scope=materials')
    assert.equal(res.body.data.some(c => c.code === 'P8'), false)
  })
})

describe('客户物料编码按客户隔离', () => {
  it('带 customer 时只返回该客户的料号', async () => {
    const res = await get('/field/customer_code?scope=materials&customer=' + encodeURIComponent('客户A'))
    assert.deepEqual(res.body.data.map(x => x.value), ['CA-1'])
  })

  it('不带 customer 时返回全部客户的料号', async () => {
    const res = await get('/field/customer_code?scope=materials')
    const values = res.body.data.map(x => x.value).sort()
    assert.deepEqual(values, ['CA-1', 'CB-1'])
  })

  it('空客户编码不进候选', async () => {
    const res = await get('/field/customer_code?scope=materials')
    assert.equal(res.body.data.some(x => x.value === ''), false)
  })
})
