/**
 * 归档迁移（archiveSync）回归测试
 *
 * 为什么有这个文件：这类缺陷连续两版都没被人工验证照出来，根因是「验证的起点选错了」——
 * 拿未迁移的干净数据去验，闸门天然是开的、照不出「只剩更新图待迁」那种真实用户状态。
 * 下面每个用例都对应一个真实踩过的坑，起点各不相同。
 *
 * 覆盖（ISSUES「归档迁移零自动化测试」那条列的四个起点）：
 *  1. 只剩 updates 待迁（正文已归档）—— countPending 漏数 updates 时整个搬迁块会被跳过
 *  2. 源文件只在 备份/ 里 —— 上一轮有 bug 的迁移把它搬走并删了，不认备份就永远修不回来
 *  3. 正文与更新引用同一张图 —— 不记忆已搬过的 URL 会复制成两份
 *  4. 同一个缺失文件被两处引用 —— 不去重会把验收数字撑大 2~4 倍
 *  5. 重跑幂等
 */
import assert from 'node:assert/strict'
import { describe, it, before } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { pathToFileURL } from 'url'

const ROOT = path.resolve(import.meta.dirname, '..')
const tmpDir = path.join(os.tmpdir(), 'crystal-archive-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

const U = p => pathToFileURL(ROOT + p).href
const SEP = path.sep
const BAK = '备份/归档前-20250101-000000'

/** 建文件（自动建目录） */
function mk(rel, content) {
  const p = path.join(tmpDir, ...rel.split('/'))
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content || 'x')
  return p
}
/** 列目录下的相对路径（正斜杠） */
function list(rel) {
  const base = path.join(tmpDir, ...rel.split('/'))
  const out = []
  const walk = d => {
    if (!fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else out.push(path.relative(base, full).split(SEP).join('/'))
    }
  }
  walk(base)
  return out.sort()
}

const custUrl = (cust, day, file) =>
  '/api/cust/' + encodeURIComponent(cust) + '/' + encodeURIComponent('记事') + '/' + day + '/' + encodeURIComponent(file)

let db, A, syncArchive

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  db = await import(U('/server/src/db.js'))
  await db.initDb()
  A = await import(U('/server/src/utils/customerArchive.js'))
  syncArchive = (await import(U('/server/src/utils/archiveSync.js'))).syncArchive

  // 起点 1 + 2：正文已归档好，只剩「更新记录」那条旧地址；源文件只在备份里
  mk('客户管理/客户A/记事/2024-01-01/图片1.png', 'body-already-archived')
  mk(`${BAK}/记事图片库/upd1.png`, 'source-in-backup-only')
  db.execute(
    'INSERT INTO notes (id,title,content,customer,created_at,images,updates,is_deleted) VALUES (1,?,?,?,?,?,?,0)',
    ['n1', '', '客户A', '2024-01-01 10:00:00',
      JSON.stringify([custUrl('客户A', '2024-01-01', '图片1.png')]),
      JSON.stringify([{ time: '2024-01-02 10:00:00', content: 'c', status: 'todo', imgs: ['/api/uploads/notes/upd1.png'] }])]
  )

  // 起点 3：正文与更新引用同一张旧图（前端保存进度时两处都写 —— NoteDetail.vue 的真实行为）
  mk('记事图片库/dup.png', 'same-file-twice')
  db.execute(
    'INSERT INTO notes (id,title,content,customer,created_at,images,updates,is_deleted) VALUES (2,?,?,?,?,?,?,0)',
    ['n2', '', '客户B', '2024-02-02 10:00:00',
      JSON.stringify(['/api/uploads/notes/dup.png']),
      JSON.stringify([{ time: '2024-02-03 10:00:00', content: 'c', status: 'todo', imgs: ['/api/uploads/notes/dup.png'] }])]
  )

  // 起点 4：文件真的没了，且被两处引用
  db.execute(
    'INSERT INTO notes (id,title,content,customer,created_at,images,updates,is_deleted) VALUES (3,?,?,?,?,?,?,0)',
    ['n3', '', '客户C', '2024-03-03 10:00:00',
      JSON.stringify(['/api/uploads/notes/gone.png']),
      JSON.stringify([{ time: '2024-03-04 10:00:00', content: 'c', status: 'todo', imgs: ['/api/uploads/notes/gone.png'] }])]
  )
  db.saveNow()
})

describe('归档迁移', () => {
  it('第一遍：四个起点一次跑通', () => {
    const rep = syncArchive({ withBackup: false })

    // 起点 1 + 2：只剩 updates 待迁时不能被闸门挡掉（countPending 必须数 updates）
    assert.equal(rep.migrated['记事更新图'], 1, '更新区那张旧图应被搬迁（含「源只在备份里」的补救）')
    const n1 = db.queryOne('SELECT images, updates FROM notes WHERE id = 1')
    const upd1 = JSON.parse(n1.updates)[0].imgs[0]
    assert.ok(upd1.startsWith('/api/cust/'), `更新区地址应被改写成归档地址，实际 ${upd1}`)
    assert.ok(!upd1.includes('/api/uploads/'), '更新区不该再留旧地址')
    assert.equal(A.resolveUrl(upd1).abs, path.join(tmpDir, '客户管理', '客户A', '记事', '2024-01-01', '图片2.png'))

    // 备份只读不删：源文件必须还在（那是回退用的最后一道保险）
    assert.ok(fs.existsSync(path.join(tmpDir, ...`${BAK}/记事图片库/upd1.png`.split('/'))),
      '备份里的源文件不能被删')

    // 起点 3：同一张图被两处引用 → 只落一个文件，两处指向同一个 URL
    // （记事更新图 全局合计仍是 1：客户A 那张算 1，客户B 那张复用正文的搬迁、不再计数）
    assert.equal(rep.migrated['记事附件'], 1)
    assert.equal(rep.migrated['记事更新图'], 1, '客户B 那张复用正文的搬迁，记账不该变成 2')
    const n2 = db.queryOne('SELECT images, updates FROM notes WHERE id = 2')
    const body2 = JSON.parse(n2.images)[0]
    const upd2 = JSON.parse(n2.updates)[0].imgs[0]
    assert.equal(body2, upd2, '正文与更新引用同一张图时，两边必须指向同一个文件')
    const day2 = list('客户管理/客户B/记事/2024-02-02').filter(f => /^图片\d+\./.test(path.basename(f)))
    assert.equal(day2.length, 1, `同一张图不该被复制成两份，实际落了 ${day2.length} 个：${day2}`)

    // 起点 4：同一个缺失文件被两处引用 → 只记一条（报告那行数字是装机手册的验收标准）
    assert.equal(rep.broken.length, 1, `同一缺失文件只应记 1 条，实际 ${rep.broken.length} 条`)
    assert.equal(rep.broken[0].引用, '/api/uploads/notes/gone.png')
  })

  it('第二遍：幂等（不重复搬、不重复删）', () => {
    const before = {
      db: crypto.createHash('md5').update(fs.readFileSync(path.join(tmpDir, '数据库', 'data.db'))).digest('hex'),
      归档: JSON.stringify(list('客户管理')),
      备份: JSON.stringify(list(BAK)),
    }
    const rep = syncArchive({ withBackup: false })
    assert.deepEqual(Object.values(rep.migrated).filter(v => v), [], '第二遍不该再搬任何文件')
    assert.equal(rep.deletedSources, 0, '第二遍不该再删任何源文件')
    assert.equal(crypto.createHash('md5').update(fs.readFileSync(path.join(tmpDir, '数据库', 'data.db'))).digest('hex'), before.db, 'data.db 不该变')
    assert.equal(JSON.stringify(list('客户管理')), before.归档, '归档区文件清单不该变')
    assert.equal(JSON.stringify(list(BAK)), before.备份, '备份区不该变')
  })
})
