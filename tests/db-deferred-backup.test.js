/**
 * 每日数据库备份「延后写盘」（v1.0.232）
 *
 * 背景：897KB 的备份写盘在慢机器上要 3~4 秒，以前堵在 initDb 里、拖慢主界面。
 * 现在 Electron 启动时只**记住读盘那一刻的字节**（DEFER_STARTUP_BACKUP=1），
 * 等主窗口显示后再 flush。
 *
 * 这里必须钉住两点：
 *   ① 延后模式下 initDb 真的不写盘（否则等于没延后）；
 *   ② flush 写出来的必须是**读盘时**的字节，不是迁移后的库（否则备份就失去「回到出事前」的意义）。
 */
import assert from 'node:assert/strict'
import { describe, it, before } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import initSqlJs from 'sql.js'

const tmpDir = path.join(os.tmpdir(), 'crystal-deferred-backup-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir
process.env.DEFER_STARTUP_BACKUP = '1'

const dbPath = path.join(tmpDir, '数据库', 'data.db')
const backupDir = path.join(tmpDir, '备份', '数据库日备')
let originalBytes
let db

before(async () => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  // 先造一个合法的 SQLite 文件（不经过 db.js，免得它顺手先备一份）
  const wasmDir = path.resolve('node_modules', 'sql.js', 'dist')
  const SQL = await initSqlJs({ locateFile: f => path.join(wasmDir, f) })
  const raw = new SQL.Database()
  raw.run('CREATE TABLE probe (id INTEGER PRIMARY KEY, v TEXT)')
  raw.run("INSERT INTO probe (v) VALUES ('pre-start-state')")
  originalBytes = Buffer.from(raw.export())
  fs.writeFileSync(dbPath, originalBytes)

  db = await import('../server/src/db.js')
  await db.initDb()
})

describe('每日备份延后写盘', () => {
  it('延后模式下 initDb 不写每日备份', () => {
    const files = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter(f => f.endsWith('.db')) : []
    assert.deepEqual(files, [], 'initDb 阶段不该出现备份文件（写盘已延后）')
  })

  it('flush 写出的备份 = 读盘那一刻的字节（不是迁移后的库）', () => {
    const dest = db.flushDeferredDailyDbBackup()
    assert.ok(dest && fs.existsSync(dest), '应返回并写出备份路径')
    assert.match(path.basename(dest), /^data-\d{4}-\d{2}-\d{2}\.db$/)
    const bytes = fs.readFileSync(dest)
    assert.equal(bytes.subarray(0, 16).toString('latin1'), 'SQLite format 3\u0000')
    assert.deepEqual(bytes, originalBytes, '备份内容必须逐字节等于启动读盘时的那份')
  })

  it('重复 flush 不重复写（幂等）', () => {
    assert.equal(db.flushDeferredDailyDbBackup(), null)
  })

  it('备份目录里仍然只有一份今天的文件', () => {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'))
    assert.equal(files.length, 1)
  })
})
