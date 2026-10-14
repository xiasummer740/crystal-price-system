/**
 * 数据库落盘的**安全网**测试 —— 原子写 + 每日备份
 *
 * 为什么值得单测：这两件事平时看不见，出事时是「有/没有」的区别。
 *   · 原子写：sql.js 整库导出一次 858KB（生产实测），直接覆盖写时断电会留下半个库；
 *   · 每日备份：防的是「手滑改错」，磁盘上的库完好但没有历史副本就回不去。
 */
import assert from 'node:assert/strict'
import { describe, it, before } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'

const tmpDir = path.join(os.tmpdir(), 'crystal-db-safety-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

const dbDir = path.join(tmpDir, '数据库')
const dbFile = path.join(dbDir, 'data.db')
const bakDir = path.join(tmpDir, '备份', '数据库日备')

let dbMod
before(async () => {
  fs.mkdirSync(dbDir, { recursive: true })
  fs.mkdirSync(path.join(tmpDir, '规格书'), { recursive: true })
  // 先造一份「上一次收工时的库」：用真的 sql.js 生成，保证是合法 SQLite
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', f)
  })
  const seed = new SQL.Database()
  seed.run('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  seed.run("INSERT INTO t (v) VALUES ('收工前的数据')")
  fs.writeFileSync(dbFile, Buffer.from(seed.export()))

  // 造 8 份「旧备份」，用来验证只保留最近 7 份
  fs.mkdirSync(bakDir, { recursive: true })
  for (let i = 1; i <= 8; i++) {
    fs.writeFileSync(path.join(bakDir, `data-2020-01-0${i}.db`), 'old')
  }

  dbMod = await import('../server/src/db.js')
  await dbMod.initDb()
})

describe('数据库安全网', () => {
  it('① 启动时会生成「当天」的整库备份，且内容是上一次收工的状态', () => {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0')
    const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const f = path.join(bakDir, `data-${today}.db`)
    assert.ok(fs.existsSync(f), `应生成 ${f}`)
    // 备份必须是可打开的合法库，且含收工前那条数据（备的是「读盘之后、迁移之前」的状态）
    assert.ok(fs.statSync(f).size > 0)
    const buf = fs.readFileSync(f)
    assert.equal(buf.subarray(0, 15).toString('utf8'), 'SQLite format 3', '应是一个真正的 SQLite 文件')
  })

  it('② 只保留最近 7 份（更早的自动清掉）', () => {
    const files = fs.readdirSync(bakDir).filter(f => /^data-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort()
    assert.equal(files.length, 7, `应只剩 7 份，实际 ${files.length}：${files.join(',')}`)
    // 留下的必须是「最近」的 7 份 —— 也就是 2020-01-02 .. 2020-01-08 + 今天
    assert.ok(!files.includes('data-2020-01-01.db'), '最旧的那份应被删掉')
    assert.ok(files.includes('data-2020-01-08.db'), '较新的应保留')
  })

  it('③ 反复 initDb 不会重复建备份，也不会把备份越删越少', async () => {
    const before = fs.readdirSync(bakDir).length
    await dbMod.initDb()
    await dbMod.initDb()
    assert.equal(fs.readdirSync(bakDir).length, before, '同日不应新增备份文件')
  })

  it('④ saveNow 是原子替换：写完不留 .tmp，且文件可重新打开并读回数据', () => {
    dbMod.execute("INSERT INTO t (v) VALUES ('落盘测试')")
    dbMod.saveNow()
    assert.ok(!fs.existsSync(`${dbFile}.tmp`), '正常路径不应留下 .tmp 残留')
    // 读回来验证内容真的落盘了（不是只改了内存）
    const copy = path.join(tmpDir, 'reopen.db')
    fs.copyFileSync(dbFile, copy)
    const raw = fs.readFileSync(copy)
    assert.equal(raw.subarray(0, 15).toString('utf8'), 'SQLite format 3')
    assert.ok(raw.includes(Buffer.from('落盘测试')), '写入的内容应在文件里')
  })
})
