/**
 * 公司资料 / 开票资料库 —— 接口测试
 *
 * 祥哥 2026-10-15 需求：一个入口存放**客户发来的开票资料**（对方多头发图片/PDF/Word/Excel）
 * 和**自己公司的**营业执照/开票资料（支持多家抬头）。
 *
 * 这里钉住的关键行为：
 *   - 上传后元数据入库、文件真的落到 `公司资料/{客户|自己公司}/<归属>/` 下
 *   - **扩展名白名单**：exe/bat 这类一律拒绝（客户发来的文件不能什么都收）
 *   - 同名文件不互相覆盖（时间戳+随机串前缀），且**原名保留**（他要靠文件名认人）
 *   - 归属名里的路径分隔符/.. 被清洗，不会跑到目录外面去
 *   - 删除：库里删掉 + 文件删掉；列表里不再出现
 *   - 自己公司主体：多抬头、默认只能有一个、名下还有资料时不许删主体
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import express from 'express'

const tmpDir = path.join(os.tmpdir(), 'crystal-docs-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let request, server, dbMod, docsMod, DOCS_ROOT
before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  dbMod = await import('../server/src/db.js')
  await dbMod.initDb()
  docsMod = await import('../server/src/routes/companyDocs.js')
  DOCS_ROOT = docsMod.DOCS_ROOT
  const app = express()
  app.use(express.json())
  app.use('/api/company-docs', docsMod.default)
  app.use('/api/company-docs/file', express.static(DOCS_ROOT))
  app.use((err, _req, res, _next) => res.status(400).json({ code: 1, msg: err.message }))
  server = app.listen(0)
  const { default: supertest } = await import('supertest')
  request = supertest(server)
})
after(async () => {
  await new Promise(r => setTimeout(r, 300))
  try { server?.close() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

const CUST = '开票测试客户甲'
const upload = (opts) => {
  const q = new URLSearchParams(opts.query).toString()
  let r = request.post(`/api/company-docs/upload?${q}`)
  for (const f of opts.files) r = r.attach('files', f.buf, { filename: f.name, contentType: f.type })
  return r
}

describe('公司资料 / 开票资料库', () => {
  it('① 上传图片成功：入库 + 文件落到「公司资料/客户/<客户名>/」', async () => {
    const r = await upload({
      query: { owner_type: 'customer', owner_name: CUST, category: '开票资料' },
      files: [{ name: '甲方开票资料.png', buf: Buffer.from('89504e470d0a1a0a', 'hex'), type: 'image/png' }]
    })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const doc = r.body.data[0]
    assert.equal(doc.owner_type, 'customer')
    assert.equal(doc.owner_name, CUST)
    assert.equal(doc.category, '开票资料')
    assert.equal(doc.file_name, '甲方开票资料.png', '原名要保留（靠文件名认人）')
    assert.equal(doc.is_image, true)
    assert.ok(doc.url.startsWith('/api/company-docs/file/'))
    // 文件真的在磁盘上，且在该客户自己的目录里
    const dir = path.join(DOCS_ROOT, '客户', CUST)
    const files = fs.readdirSync(dir)
    assert.equal(files.length, 1)
    assert.ok(files[0].endsWith('甲方开票资料.png'))
    assert.ok(files[0].length > '甲方开票资料.png'.length, '应有时间戳+随机串前缀防覆盖')
  })

  it('② 同名文件不互相覆盖（两个都留下来）', async () => {
    const q = { owner_type: 'customer', owner_name: CUST, category: '开票资料' }
    const mk = () => upload({ query: q, files: [{ name: '开票资料.pdf', buf: Buffer.from('%PDF-1.4 test'), type: 'application/pdf' }] })
    const a = await mk(); const b = await mk()
    assert.equal(a.status, 200); assert.equal(b.status, 200)
    assert.notEqual(a.body.data[0].file_path, b.body.data[0].file_path)
    const pdfs = fs.readdirSync(path.join(DOCS_ROOT, '客户', CUST)).filter(f => f.endsWith('.pdf'))
    assert.equal(pdfs.length, 2, '两份同名 pdf 应该都在')
  })

  it('③ 扩展名白名单：exe/bat 这类被拒绝（不能什么都收）', async () => {
    for (const bad of ['木马.exe', '脚本.bat', '无扩展名']) {
      const r = await upload({
        query: { owner_type: 'customer', owner_name: CUST },
        files: [{ name: bad, buf: Buffer.from('x'), type: 'application/octet-stream' }]
      })
      assert.equal(r.status, 400, `${bad} 应该被拒`)
      assert.match(r.body.msg, /不支持的文件类型/)
    }
    // Word/Excel 是允许的（开票资料常见）
    const ok = await upload({
      query: { owner_type: 'customer', owner_name: CUST },
      files: [{ name: '开票信息.xlsx', buf: Buffer.from('PK'), type: 'application/vnd.ms-excel' }]
    })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.data[0].ext, 'xlsx')
  })

  it('④ 归属名里的路径分隔符 / .. 被清洗，不会跑到目录外面', async () => {
    const evil = '../../逃逸客户'
    const r = await upload({
      query: { owner_type: 'customer', owner_name: evil },
      files: [{ name: 'a.png', buf: Buffer.from('x'), type: 'image/png' }]
    })
    assert.equal(r.status, 200)
    // 目录必须仍在 公司资料/客户/ 下面
    const base = path.join(DOCS_ROOT, '客户')
    const dirs = fs.readdirSync(base)
    assert.ok(dirs.length >= 1)
    for (const d of dirs) {
      const abs = path.join(base, d)
      assert.ok(abs.startsWith(base), '目录不能跑到「客户」外面')
      assert.ok(!d.includes('..'), `目录名不该含 ..：${d}`)
    }
    // 库里存的归属名也应是清洗后的（不含路径分隔符）
    assert.ok(!r.body.data[0].owner_name.includes('/') && !r.body.data[0].owner_name.includes('\\'))
  })

  it('⑤ 列表按归属返回；删除后列表与文件都没了', async () => {
    const before = await request.get('/api/company-docs/docs').query({ owner_type: 'customer', owner_name: CUST })
    assert.equal(before.status, 200)
    const n = before.body.data.length
    assert.ok(n >= 4, `应有至少 4 份，实际 ${n}`)
    const target = before.body.data[0]
    const del = await request.delete(`/api/company-docs/docs/${target.id}`)
    assert.equal(del.status, 200)
    const after = await request.get('/api/company-docs/docs').query({ owner_type: 'customer', owner_name: CUST })
    assert.equal(after.body.data.length, n - 1)
    assert.ok(!after.body.data.some(d => d.id === target.id))
    assert.ok(!fs.existsSync(path.join(DOCS_ROOT, ...target.url.split('/').slice(4).map(decodeURIComponent))), '文件也应删掉')
  })

  it('⑥ 汇总：自己公司主体（含份数）+ 存过资料的客户列表', async () => {
    await request.post('/api/company-docs/companies').send({ name: '晶科鑫（测试主体）', tax_no: '91440300TEST0001X', is_default: true })
    await upload({
      query: { owner_type: 'self', owner_name: '晶科鑫（测试主体）', category: '营业执照' },
      files: [{ name: '营业执照.jpg', buf: Buffer.from('x'), type: 'image/jpeg' }]
    })
    const s = await request.get('/api/company-docs/summary')
    assert.equal(s.status, 200)
    const me = s.body.data.companies.find(c => c.name === '晶科鑫（测试主体）')
    assert.ok(me, '汇总里应有这个主体')
    assert.equal(me.is_default, 1)
    assert.equal(me.doc_count, 1)
    const cust = s.body.data.customers.find(c => c.name === CUST)
    assert.ok(cust && cust.doc_count >= 3)
    assert.ok(s.body.data.categories.includes('开票资料'))
    assert.ok(s.body.data.allowed_ext.includes('pdf'))
  })

  it('⑦ 默认主体只能有一个（开票时不该有两套都叫默认）', async () => {
    await request.post('/api/company-docs/companies').send({ name: '第二主体', is_default: true })
    const list = await request.get('/api/company-docs/companies')
    assert.equal(list.body.data.filter(c => c.is_default === 1).length, 1, '默认只能一个')
  })

  it('⑧ 名下还有资料的自己公司主体不许删（否则文件变孤儿）', async () => {
    const list = await request.get('/api/company-docs/companies')
    const me = list.body.data.find(c => c.name === '晶科鑫（测试主体）')
    const del = await request.delete(`/api/company-docs/companies/${me.id}`)
    assert.equal(del.status, 409)
    assert.match(del.body.msg, /还有 1 份资料/)
    // 没资料的可以直接删
    await request.post('/api/company-docs/companies').send({ name: '空主体' })
    const l2 = await request.get('/api/company-docs/companies')
    const empty = l2.body.data.find(c => c.name === '空主体')
    const del2 = await request.delete(`/api/company-docs/companies/${empty.id}`)
    assert.equal(del2.status, 200)
  })

  it('⑨ 静态托管能取到文件（手机端/预览都靠它）', async () => {
    const list = await request.get('/api/company-docs/docs').query({ owner_type: 'customer', owner_name: CUST })
    const doc = list.body.data.find(d => d.is_image)
    const r = await request.get(doc.url)
    assert.equal(r.status, 200)
  })

  it('⑪ 新增格式：HEIC/OFD/WPS 收；svg/html 故意不收（同源 XSS 跳板）', async () => {
    const q = (name, type = 'application/octet-stream') => ({
      query: { owner_type: 'customer', owner_name: CUST, category: '开票资料' },
      files: [{ name, buf: Buffer.from('x'), type }]
    })
    // 收：iPhone 照片、电子发票、WPS 三件套
    for (const [name, ext] of [['IMG_1234.HEIC', 'heic'], ['发票.ofd', 'ofd'], ['对账单.wps', 'wps'], ['开票信息.et', 'et']]) {
      const r = await upload(q(name))
      assert.equal(r.status, 200, `${name} 应该被接受：${JSON.stringify(r.body)}`)
      assert.equal(r.body.data[0].ext, ext, '扩展名要归一成小写')
    }
    // 不收：svg / html —— 它们会被 express.static 同源打开，脚本能读 localStorage 里的接口 token
    for (const bad of ['攻击.svg', '钓鱼.html', '脚本.htm']) {
      const r = await upload(q(bad, 'image/svg+xml'))
      assert.equal(r.status, 400, `${bad} 必须拒绝`)
      assert.match(r.body.msg, /不支持的文件类型/)
    }
    // HEIC 允许上传但**不能当图片预览**（浏览器解不了，标成图片会显示破图）
    const heic = await upload(q('拍照.heic'))
    assert.equal(heic.body.data[0].is_image, false, 'HEIC 不该标成可预览图片')
    const png = await upload(q('截图.png', 'image/png'))
    assert.equal(png.body.data[0].is_image, true, 'PNG 可以预览')
  })

  it('⑫ 缺少归属名要报错（不然文件会落到「未命名」里，谁也找不到）', async () => {
    const r = await request.get('/api/company-docs/docs').query({ owner_type: 'customer', owner_name: '' })
    assert.equal(r.status, 400)
  })
})
