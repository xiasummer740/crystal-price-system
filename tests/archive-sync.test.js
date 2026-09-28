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
 *  6. 物料清单文件名带客户全名（旧名改名 / 新名已存在不覆盖 / 生成也用新名 / 改名失败留痕）
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

describe('物料清单文件名带客户全名', () => {
  const list1 = c => path.join(tmpDir, '客户管理', c, c + '物料清单.xlsx')
  const legacy = c => path.join(tmpDir, '客户管理', c, '物料清单.xlsx')

  it('旧名改成新名；新名已存在时旧名原样留着', () => {
    mk('客户管理/客户A/物料清单.xlsx', 'legacy-A')
    mk('客户管理/客户B/物料清单.xlsx', 'legacy-B')
    mk('客户管理/客户B/客户B物料清单.xlsx', 'already-new-B')

    const rep = syncArchive({ withBackup: false })

    assert.equal(rep.renamed.物料清单, 1, `只该给客户A改名，实际 ${rep.renamed.物料清单}`)
    assert.ok(fs.existsSync(list1('客户A')), '客户A 应出现带全名的新文件')
    assert.ok(!fs.existsSync(legacy('客户A')), '客户A 不该再留旧名文件')
    // 是「改名」不是「重新生成」—— 内容必须原样过来
    assert.equal(fs.readFileSync(list1('客户A'), 'utf8'), 'legacy-A')

    assert.ok(fs.existsSync(legacy('客户B')), '新名已存在时旧名必须原样留着，不猜哪个对')
    assert.equal(fs.readFileSync(list1('客户B'), 'utf8'), 'already-new-B', '不能覆盖已有的新名文件')
    // 留下的那份必须登记 —— 引擎只认新名，旧文件从此不再更新，得让人去确认
    assert.deepEqual(rep.keptLegacy, ['客户B/物料清单.xlsx'], '保留旧名的必须被记下来')

    const txt = fs.readFileSync(path.join(tmpDir, '客户资料归档报告.txt'), 'utf8')
    assert.match(txt, /物料清单改名：成功 1 份，新名已存在、旧名原样保留 1 份/)
    assert.match(txt, /⚠️ 保留旧名的客户[^\n]*客户B/, '报告里要列名，便于人工核对')
  })

  it('重跑幂等：不再改名', () => {
    const rep = syncArchive({ withBackup: false })
    assert.equal(rep.renamed.物料清单, 0, '旧名已不存在，第二遍不该再改名')
    assert.deepEqual(rep.keptLegacy, ['客户B/物料清单.xlsx'], '保留名单每轮应稳定，不能越滚越多')
  })

  it('客户改名/合并后，新目录里顶着别的客户名的清单要归位', () => {
    // 现场就是 materials.js moveInto 搬完的样子：文件连名带内容原样过来，名字还是上一个客户的
    mk('客户管理/客户H/客户G物料清单.xlsx', 'moved-from-G')
    // 合并场景：目标目录自己那份正名也在，旧的这份不许覆盖，只能留下并登记
    mk('客户管理/客户I/客户I物料清单.xlsx', 'canonical-I')
    mk('客户管理/客户I/客户J物料清单.xlsx', 'merged-from-J')

    const rep = syncArchive({ withBackup: false })
    const hDir = path.join(tmpDir, '客户管理', '客户H')

    assert.ok(fs.existsSync(list1('客户H')), '顶着旧客户名的清单应归位成「客户H物料清单.xlsx」')
    assert.ok(!fs.existsSync(path.join(hDir, '客户G物料清单.xlsx')), '不该再留着旧客户名的那份')
    assert.equal(fs.readFileSync(list1('客户H'), 'utf8'), 'moved-from-G', '是改名不是重新生成')

    const iDir = path.join(tmpDir, '客户管理', '客户I')
    assert.equal(fs.readFileSync(path.join(iDir, '客户I物料清单.xlsx'), 'utf8'), 'canonical-I', '不能覆盖正名')
    assert.ok(fs.existsSync(path.join(iDir, '客户J物料清单.xlsx')), '正名已存在时旧的留着待人工确认')
    assert.ok(rep.keptLegacy.includes('客户I/客户J物料清单.xlsx'), '留下的一定要登记，否则永远没人过问')
  })

  it('改名失败要留痕（报告里不能跟「本来就没旧名」长得一样）', () => {
    mk('客户管理/客户G/物料清单.xlsx', 'legacy-G')
    const real = fs.renameSync
    fs.renameSync = () => { const e = new Error('模拟被占用'); e.code = 'EPERM'; throw e }
    let rep
    try { rep = syncArchive({ withBackup: false }) } finally { fs.renameSync = real }

    const fails = rep.failed.filter(f => f.类别 === '物料清单改名')
    assert.equal(fails.length, 1, `应记录 1 条改名失败，实际 ${fails.length}`)
    assert.equal(fails[0].记录, '客户G')
    assert.ok(fs.existsSync(legacy('客户G')), '改名失败时旧文件必须原样还在')

    const txt = fs.readFileSync(path.join(tmpDir, '客户资料归档报告.txt'), 'utf8')
    assert.match(txt, /物料清单改名：成功 0 份，失败 1 份/, '失败必须出现在报告里')
  })

  it('改名明细要逐条进报告（只记个数 = 验收的人无从抽查）', () => {
    // 单份候选：顶着别的客户名，但按「客户改过名」的假设它就该归位。
    // 这个假设要是错了（那是别家误放进来的清单），唯一能事后发现的就是这份明细。
    mk('客户管理/客户L/客户W物料清单.xlsx', 'from-W')

    const rep = syncArchive({ withBackup: false })

    const line = '客户L/客户W物料清单.xlsx → 客户L物料清单.xlsx'
    assert.ok(rep.renamedList.includes(line), `改名明细缺这条，实际 ${JSON.stringify(rep.renamedList)}`)
    assert.equal(fs.readFileSync(list1('客户L'), 'utf8'), 'from-W', '内容是原样过来的，不是重新生成')
    const txt = fs.readFileSync(path.join(tmpDir, '客户资料归档报告.txt'), 'utf8')
    assert.ok(txt.includes(line), '报告正文里要有逐条明细，否则登记了也没人看得见')
  })

  it('候选不止一份时不猜：两份都留着并登记（顺序不该决定谁是正名）', () => {
    mk('客户管理/客户K/客户X物料清单.xlsx', 'from-X')
    mk('客户管理/客户K/客户Y物料清单.xlsx', 'from-Y')

    const rep = syncArchive({ withBackup: false })
    const kDir = path.join(tmpDir, '客户管理', '客户K')

    assert.ok(!fs.existsSync(list1('客户K')), '两份候选谁是真身从名字判断不出来，不该擅自定正名')
    assert.equal(fs.readFileSync(path.join(kDir, '客户X物料清单.xlsx'), 'utf8'), 'from-X', '两份都要原样留着')
    assert.equal(fs.readFileSync(path.join(kDir, '客户Y物料清单.xlsx'), 'utf8'), 'from-Y')
    assert.ok(rep.keptLegacy.includes('客户K/客户X物料清单.xlsx'), '留下的必须登记，否则永远没人过问')
    assert.ok(rep.keptLegacy.includes('客户K/客户Y物料清单.xlsx'))

    const txt = fs.readFileSync(path.join(tmpDir, '客户资料归档报告.txt'), 'utf8')
    assert.match(txt, /保留旧名的客户[^\n]*客户K/, '报告要点名到客户')
  })

  it('新生成的物料清单也带客户全名', () => {
    db.execute(
      "INSERT INTO customer_materials (customer, date, material_name, is_deleted) VALUES (?,?,?,0)",
      ['客户F', '2024-05-05', 'm1']
    )
    db.saveNow()

    syncArchive({ withBackup: false })

    assert.ok(fs.existsSync(list1('客户F')), '生成的应是「客户F物料清单.xlsx」')
    assert.ok(!fs.existsSync(legacy('客户F')), '不该再生成旧名的物料清单')
  })
})

describe('归档报告写失败不能静默', () => {
  it('报告写不出去时要在 rep 里留痕（否则磁盘上那份旧报告会被当成这次的结论）', () => {
    mk('客户管理/客户H/物料清单.xlsx', 'legacy-H')
    const reportAbs = path.join(tmpDir, '客户资料归档报告.txt')
    // 先放一份「上一次」的报告，模拟真实场景：用户正拿 Excel 开着它 → 本次写失败
    fs.writeFileSync(reportAbs, '这是上一次的报告，内容早已过时')

    const real = fs.writeFileSync
    fs.writeFileSync = (p, ...rest) => {
      if (path.resolve(p) === path.resolve(reportAbs)) {
        const e = new Error('EBUSY: resource busy or locked')
        e.code = 'EBUSY'
        throw e
      }
      return real(p, ...rest)
    }
    let rep
    try { rep = syncArchive({ withBackup: false }) } finally { fs.writeFileSync = real }

    assert.ok(rep.reportWriteError, '写失败必须记进 rep，不能空 catch 吞掉')
    assert.match(rep.reportWriteError, /EBUSY/)
    // 确认「磁盘上那份是旧内容」这个前提成立 —— 上一条断言若成立而这条不成立，
    // 说明失败其实是假的（文件被更新了），得回头查测试本身
    assert.equal(fs.readFileSync(reportAbs, 'utf8'), '这是上一次的报告，内容早已过时')
  })
})
