/**
 * 记事「关联物料」单位默认 PCS（v1.0.234）
 *
 * 前端已把单位固定成 PCS（不再给输入框）；后端兜底：旧客户端/旧数据没传 unit 时按 PCS 存，
 * 免得时间线/详情里出现「6000」后面空一块。
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-note-unit-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir
let request, server

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  const db = await import('../server/src/db.js')
  await db.initDb()
  const notesRouter = (await import('../server/src/routes/notes.js')).default
  const app = express()
  app.use(express.json())
  app.use('/api/notes', notesRouter)
  server = app.listen(0)
  const { default: supertest } = await import('supertest')
  request = supertest(server)
})

after(async () => {
  await new Promise(r => setTimeout(r, 500))
  try { server?.close() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

async function createAndGet(refs) {
  const res = await request.post('/api/notes').send({ title: '单位测试', customer: '客户U', material_refs: refs })
  assert.equal(res.status, 200)
  const id = res.body.data.id
  const detail = await request.get(`/api/notes/${id}`)
  return detail.body.data.material_refs[0]
}

describe('关联物料单位', () => {
  it('没传 unit 时默认存 PCS', async () => {
    const ref = await createAndGet([{ material_id: 123, name: '某物料', action: '下单', quantity: '6000' }])
    assert.equal(ref.unit, 'PCS')
    assert.equal(ref.quantity, '6000')
  })

  it('显式传了别的单位仍按原样存（不擅自改历史数据）', async () => {
    const ref = await createAndGet([{ material_id: 124, name: '旧单位物料', action: '备货', quantity: '10', unit: '颗' }])
    assert.equal(ref.unit, '颗')
  })
})
