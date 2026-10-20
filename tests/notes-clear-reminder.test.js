/**
 * 记事「快捷清除提醒」（v1.0.233）
 *
 * 卡片上的「清除」按钮走专用接口 POST /api/notes/:id/clear-reminder。
 * 这里钉住：
 *   ① 只动 reminder_at / is_reminded，正文/标题/客户/图片不被回写；
 *   ② 已经提醒过（is_reminded=1）的也能清；
 *   ③ 只影响这一条，不碰别的记事；
 *   ④ 不存在 / 已删除 → 404；重复点（幂等）→ 200。
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-note-clear-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server, db

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  db = await import('../server/src/db.js')
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

async function createNote(overrides = {}) {
  const res = await request.post('/api/notes').send({
    title: '测试记事',
    content: '正文内容不要被改',
    customer: '测试客户A',
    reminder_at: '2026-10-25 09:30:00',
    ...overrides
  })
  assert.equal(res.status, 200)
  return res.body.data.id
}
const row = id => db.queryOne('SELECT * FROM notes WHERE id = ?', [id])

describe('POST /api/notes/:id/clear-reminder', () => {
  it('只清 reminder_at / is_reminded，正文等字段原样保留', async () => {
    const id = await createNote({ images: JSON.stringify(['/a.png']) })
    const before = row(id)
    const res = await request.post(`/api/notes/${id}/clear-reminder`)
    assert.equal(res.status, 200)
    assert.equal(res.body.code, 0)
    const after = row(id)
    assert.equal(after.reminder_at, null)
    assert.equal(after.is_reminded, 0)
    assert.equal(after.title, before.title)
    assert.equal(after.content, before.content)
    assert.equal(after.customer, before.customer)
    assert.equal(after.images, before.images)
  })

  it('已经提醒过（is_reminded=1）的也能清', async () => {
    const id = await createNote()
    await request.post(`/api/notes/${id}/reminded`)
    assert.equal(row(id).is_reminded, 1)
    const res = await request.post(`/api/notes/${id}/clear-reminder`)
    assert.equal(res.status, 200)
    assert.equal(row(id).reminder_at, null)
    assert.equal(row(id).is_reminded, 0)
  })

  it('只影响这一条，别人的提醒不动', async () => {
    const a = await createNote({ title: 'A' })
    const b = await createNote({ title: 'B' })
    await request.post(`/api/notes/${a}/clear-reminder`)
    assert.equal(row(a).reminder_at, null)
    assert.equal(row(b).reminder_at, '2026-10-25 09:30:00')
  })

  it('不存在的记事 → 404', async () => {
    const res = await request.post('/api/notes/999999/clear-reminder')
    assert.equal(res.status, 404)
    assert.equal(res.body.code, 1)
  })

  it('已软删除的记事 → 404', async () => {
    const id = await createNote()
    db.execute("UPDATE notes SET is_deleted = 1 WHERE id = ?", [id])
    const res = await request.post(`/api/notes/${id}/clear-reminder`)
    assert.equal(res.status, 404)
  })

  it('重复点（幂等）→ 200', async () => {
    const id = await createNote()
    assert.equal((await request.post(`/api/notes/${id}/clear-reminder`)).status, 200)
    assert.equal((await request.post(`/api/notes/${id}/clear-reminder`)).status, 200)
    assert.equal(row(id).reminder_at, null)
  })
})
