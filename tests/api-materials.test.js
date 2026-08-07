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
