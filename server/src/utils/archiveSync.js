/**
 * 客户资料归档 —— 把归档区对齐到数据库
 *
 * 一次调用做三件事：
 *   ① 真搬家：旧目录的文件按客户/品类挪进归档区，数据库引用同步改写
 *   ② 产出可读文件：每客户每天的 记事.txt、每客户的 物料清单.xlsx
 *   ③ 自检：DB 里每个引用都能落到真实文件？旧目录里剩的文件有没有主？
 *
 * 幂等：已经搬过的直接跳过，连跑几次结果一致。启动时跑一次即可，
 * 「另一台电脑装完自动整理旧数据」走的也是这条路径。
 *
 * 安全次序（缺一不可）：
 *   备份 → 复制文件（不动源）→ 改写数据库并落盘 → 确认落盘后才删源 → 写报告
 * 任何一步崩掉，源文件都还在，重跑即可，不会丢数据。
 */
import fs from 'fs'
import path from 'path'
import { queryAll, execute, saveNow } from '../db.js'
import * as A from './customerArchive.js'
import { exportMaterials } from './export.js'

// ===== 小工具 =====

function timestamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walkFiles(full, out)
    else out.push(full)
  }
  return out
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0
  fs.mkdirSync(dest, { recursive: true })
  let n = 0
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name)
    if (e.isDirectory()) n += copyDir(s, d)
    else { fs.copyFileSync(s, d); n++ }
  }
  return n
}

function parseJsonArray(s) {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

function dayOf(s) {
  const d = String(s || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '未知日期'
}

const LEGACY_DIRS = [A.LEGACY.spec, A.LEGACY.notesImages, A.LEGACY.priceImages, A.LEGACY.materialImages]

function freshReport() {
  return {
    startedAt: new Date(),
    finishedAt: null,
    backupDir: null,
    deletedSources: 0,
    migrated: { 客户物料规格书: 0, 报价规格书: 0, 客户物料图片: 0, 报价备注图: 0, 记事附件: 0 },
    generated: { 记事txt: 0, 物料清单: 0 },
    skipped: 0,
    conflicts: [],      // 客户名净化后撞车
    broken: [],         // 数据库指向的文件找不到
    failed: [],         // 搬迁失败
    orphans: [],        // 旧目录里没被任何引用认领的文件
    oldDirsLeft: []     // 迁移后旧目录还剩什么
  }
}

// ===== 旧区文件索引 =====
// 光靠「数据库里写的路径」定位源文件是不够的：历史上搬过一轮，
// 文件可能躺在 规格书/客户物料/<客户>/ 而不是数据库写的 规格书/ 根目录。
// 这里把旧区全扫一遍按文件名建索引：优先精确路径，次选同名文件。

function buildLegacyIndex() {
  const byName = new Map()   // basename → [absPath]
  for (const r of LEGACY_DIRS) {
    for (const f of walkFiles(A.rootAbs(r))) {
      const b = path.basename(f)
      if (!byName.has(b)) byName.set(b, [])
      byName.get(b).push(f)
    }
  }
  return byName
}

/**
 * 找搬迁的源文件。
 * 同一份文件被多条记录引用是常态（国润那批规格书就是），所以不排除「已被认领」的文件 ——
 * 拷贝是「复制到各目的地」，一份源可以供多个目标，源只删一次。
 *
 * @returns {string|{ambiguous:string[]}|null} 绝对路径 / 同名多份待定 / 找不到
 */
function locateSource(byName, preferred, hint) {
  for (const p of preferred) {
    if (p && fs.existsSync(p)) return path.resolve(p)
  }
  const base = path.basename(preferred[0] || '')
  const cands = byName.get(base) || []
  if (!cands.length) return null
  if (cands.length === 1) return path.resolve(cands[0])
  // 同名多份：优先挑路径里带该客户/品类名的那个
  if (hint) {
    const hit = cands.find(c => c.split(path.sep).includes(A.safeSegment(hint)))
    if (hit) return path.resolve(hit)
  }
  return { ambiguous: cands }
}

/** 这个引用是否还没进归档区（或虽在归档区但文件没了） */
function isPending(url) {
  if (!url) return false
  const hit = A.resolveUrl(url, { legacy: false })
  return !hit || !fs.existsSync(hit.abs)
}

function countPending(rows) {
  let n = 0
  for (const m of rows.mats) {
    if (isPending(m.spec_document)) n++
    for (const u of parseJsonArray(m.remark_images)) if (isPending(u)) n++
  }
  for (const p of rows.prices) {
    if (isPending(p.spec_document)) n++
    for (const u of parseJsonArray(p.remark_images)) if (isPending(u)) n++
  }
  for (const nt of rows.notes) for (const u of parseJsonArray(nt.images)) if (isPending(u)) n++
  return n
}

// ===== 第 1 层：备份 =====

/**
 * 搬迁前整份备份（data.db + 四个旧目录）。
 * 先写 .tmp 再原子改名 —— 只有 归档前-<时间戳>/ 这个正式目录出现，才代表备份完整。
 * 已经有一份备份就跳过，不重复占地方。
 */
function backupBeforeMigrate(rep) {
  const backupRoot = A.rootAbs(A.DIR.backup)
  if (fs.existsSync(backupRoot) && fs.readdirSync(backupRoot).some(f => f.startsWith('归档前-') && !f.endsWith('.tmp'))) {
    return null
  }
  const stamp = timestamp()
  const tmpDir = path.join(backupRoot, `归档前-${stamp}.tmp`)
  const finalDir = path.join(backupRoot, `归档前-${stamp}`)
  try {
    saveNow()                                   // 先把内存里的库落盘，别备份到一个滞后状态
    A.ensureDir(tmpDir)
    fs.copyFileSync(A.rootAbs('数据库', 'data.db'), path.join(tmpDir, 'data.db'))
    let files = 1
    for (const r of LEGACY_DIRS) files += copyDir(A.rootAbs(r), path.join(tmpDir, r))
    fs.writeFileSync(path.join(tmpDir, '备份说明.txt'),
      `搬迁前自动备份\n时间：${new Date().toLocaleString('zh-CN')}\n文件数：${files}\n\n` +
      `内容：data.db + ${LEGACY_DIRS.join(' / ')}\n` +
      '这是搬家前的原始状态，出问题可以整个拷回来。\n', 'utf8')
    fs.renameSync(tmpDir, finalDir)             // 原子落定
    rep.backupDir = finalDir
    return finalDir
  } catch (e) {
    // 备份没做成 → 不搬。宁可不搬，也不能在没备份的情况下动生产数据
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* 留着当线索 */ }
    throw new Error('搬迁前备份失败，已中止搬迁：' + e.message)
  }
}

// ===== 主流程 =====

export function syncArchive({ withBackup = true } = {}) {
  const rep = freshReport()
  const used = new Set()          // 本次认领过的源文件（给孤儿判定用）
  const toDelete = new Set()      // 数据库落盘成功后才删
  const dbOps = []                // { sql, params }

  const rows = {
    mats: queryAll('SELECT id, customer, spec_document, remark_images FROM customer_materials WHERE is_deleted = 0'),
    prices: queryAll('SELECT id, category, spec_document, remark_images FROM material_prices WHERE is_deleted = 0'),
    notes: queryAll('SELECT id, customer, created_at, images FROM notes WHERE is_deleted = 0')
  }

  // —— 客户名净化后撞车：两个不同客户名落到同一个文件夹 → 不猜，跳过并报告 ——
  const folderOf = new Map()      // 文件夹名 → Set(原始客户名)
  const rawNames = new Set()
  for (const r of rows.mats) if (r.customer) rawNames.add(r.customer)
  for (const r of rows.notes) if (r.customer) rawNames.add(r.customer)
  for (const name of rawNames) {
    const f = A.customerFolder(name)
    if (!folderOf.has(f)) folderOf.set(f, new Set())
    folderOf.get(f).add(name)
  }
  const conflictFolders = new Set()
  for (const [f, names] of folderOf) {
    if (names.size > 1) { conflictFolders.add(f); rep.conflicts.push({ 文件夹: f, 客户名: [...names] }) }
  }
  const blocked = (customer) => conflictFolders.has(A.customerFolder(customer))

  // 有活干才备份（第一次升级会跑，之后每次启动都是零成本跳过）
  const pending = countPending(rows)
  if (pending > 0 && withBackup) backupBeforeMigrate(rep)

  if (pending > 0) {
    const byName = buildLegacyIndex()

    // ——— ① 客户物料规格书 ———
    for (const m of rows.mats) {
      const url = (m.spec_document || '').trim()
      if (!url || !isPending(url)) continue
      if (blocked(m.customer)) { rep.skipped++; continue }

      const fn = A.filenameFromUrl(url)
      const suffix = A.querySuffixOf(url)
      if (!fn) { rep.broken.push({ 类别: '客户物料规格书', 记录: m.id, 引用: url, 原因: 'URL 里取不到文件名' }); continue }

      const custFolder = A.customerFolder(m.customer)
      const src = locateSource(byName, [
        A.rootAbs(A.LEGACY.spec, '客户物料', custFolder, fn),   // 上一轮迁移搬过的位置
        A.rootAbs(A.LEGACY.spec, fn)                            // 更早的根目录位置
      ], m.customer)
      if (src && typeof src === 'object') { rep.failed.push({ 类别: '客户物料规格书', 记录: m.id, 原因: `同名文件多份，无法判断：${src.ambiguous.join(' | ')}` }); continue }
      if (!src) { rep.broken.push({ 类别: '客户物料规格书', 记录: m.id, 引用: url, 原因: '磁盘上找不到文件' }); continue }

      const destAbs = path.join(A.customerSpecDirAbs(m.customer), fn)
      const r = A.copyVerified(src, destAbs)
      if (!r.ok) { rep.failed.push({ 类别: '客户物料规格书', 记录: m.id, 原因: r.reason }); continue }
      used.add(src)
      if (path.resolve(src) !== path.resolve(destAbs)) toDelete.add(src)

      const newUrl = A.customerSpecUrl(m.customer, fn) + suffix
      if (newUrl !== url) dbOps.push({ sql: 'UPDATE customer_materials SET spec_document = ? WHERE id = ?', params: [newUrl, m.id] })
      rep.migrated.客户物料规格书++
    }

    // ——— ② 报价规格书 ———
    for (const p of rows.prices) {
      const url = (p.spec_document || '').trim()
      if (!url || !isPending(url)) continue

      const fn = A.filenameFromUrl(url)
      const suffix = A.querySuffixOf(url)
      if (!fn) { rep.broken.push({ 类别: '报价规格书', 记录: p.id, 引用: url, 原因: 'URL 里取不到文件名' }); continue }

      const catFolder = A.categoryFolder(p.category)
      const src = locateSource(byName, [
        A.rootAbs(A.LEGACY.spec, '报价', catFolder, fn),
        A.rootAbs(A.LEGACY.spec, fn)
      ], p.category)
      if (src && typeof src === 'object') { rep.failed.push({ 类别: '报价规格书', 记录: p.id, 原因: `同名文件多份：${src.ambiguous.join(' | ')}` }); continue }
      if (!src) { rep.broken.push({ 类别: '报价规格书', 记录: p.id, 引用: url, 原因: '磁盘上找不到文件' }); continue }

      const destAbs = path.join(A.quoteSpecDirAbs(p.category), fn)
      const r = A.copyVerified(src, destAbs)
      if (!r.ok) { rep.failed.push({ 类别: '报价规格书', 记录: p.id, 原因: r.reason }); continue }
      used.add(src)
      if (path.resolve(src) !== path.resolve(destAbs)) toDelete.add(src)

      const newUrl = A.quoteSpecUrl(p.category, fn) + suffix
      if (newUrl !== url) dbOps.push({ sql: 'UPDATE material_prices SET spec_document = ? WHERE id = ?', params: [newUrl, p.id] })
      rep.migrated.报价规格书++
    }

    // ——— ③ 客户物料备注图 ———
    for (const m of rows.mats) {
      const list = parseJsonArray(m.remark_images)
      if (!list.length || !list.some(isPending)) continue
      if (blocked(m.customer)) { rep.skipped++; continue }
      const out = []
      let changed = false
      for (const url of list) {
        if (!isPending(url)) { out.push(url); continue }
        const fn = A.filenameFromUrl(url)
        const src = locateSource(byName, [A.rootAbs(A.LEGACY.materialImages, fn)], '')
        if (!src || typeof src === 'object') {
          rep.broken.push({ 类别: '客户物料图片', 记录: m.id, 引用: url, 原因: src ? '同名多份' : '磁盘上找不到文件' })
          out.push(url); continue
        }
        const destAbs = path.join(A.customerImageDirAbs(m.customer), fn)
        const r = A.copyVerified(src, destAbs)
        if (!r.ok) { rep.failed.push({ 类别: '客户物料图片', 记录: m.id, 原因: r.reason }); out.push(url); continue }
        used.add(src)
        if (path.resolve(src) !== path.resolve(destAbs)) toDelete.add(src)
        out.push(A.customerImageUrl(m.customer, fn))
        changed = true
        rep.migrated.客户物料图片++
      }
      if (changed) dbOps.push({ sql: 'UPDATE customer_materials SET remark_images = ? WHERE id = ?', params: [JSON.stringify(out), m.id] })
    }

    // ——— ④ 报价备注图 ———
    for (const p of rows.prices) {
      const list = parseJsonArray(p.remark_images)
      if (!list.length || !list.some(isPending)) continue
      const out = []
      let changed = false
      for (const url of list) {
        if (!isPending(url)) { out.push(url); continue }
        const fn = A.filenameFromUrl(url)
        const src = locateSource(byName, [A.rootAbs(A.LEGACY.priceImages, fn)], '')
        if (!src || typeof src === 'object') {
          rep.broken.push({ 类别: '报价备注图', 记录: p.id, 引用: url, 原因: src ? '同名多份' : '磁盘上找不到文件' })
          out.push(url); continue
        }
        const destAbs = path.join(A.quoteImageDirAbs(), fn)
        const r = A.copyVerified(src, destAbs)
        if (!r.ok) { rep.failed.push({ 类别: '报价备注图', 记录: p.id, 原因: r.reason }); out.push(url); continue }
        used.add(src)
        if (path.resolve(src) !== path.resolve(destAbs)) toDelete.add(src)
        out.push(A.quoteImageUrl(fn))
        changed = true
        rep.migrated.报价备注图++
      }
      if (changed) dbOps.push({ sql: 'UPDATE material_prices SET remark_images = ? WHERE id = ?', params: [JSON.stringify(out), p.id] })
    }

    // ——— ⑤ 记事附件：一天一个文件夹，图片统一命名 图片N（铺平，不建 图片/ 子目录）———
    for (const n of rows.notes) {
      const imgs = parseJsonArray(n.images)
      if (!imgs.length || !imgs.some(isPending)) continue
      if (blocked(n.customer)) { rep.skipped++; continue }

      const day = dayOf(n.created_at)
      const dayDir = A.customerNoteDayDirAbs(n.customer, day)
      const out = []
      let changed = false
      let seq = 0
      for (const url of imgs) {
        const fn = A.filenameFromUrl(url)
        const inPlace = A.resolveUrl(url, { legacy: false })
        // 已经在正确的日期目录里 → 原样保留（幂等：重跑不会重新编号）
        if (inPlace && inPlace.abs.startsWith(dayDir + path.sep) && fs.existsSync(inPlace.abs)) {
          out.push(url)
          seq = Math.max(seq, Number((fn.match(/^图片(\d+)\.[^.]+$/) || [0, 0])[1]) || 0)
          continue
        }
        const src = locateSource(byName, [A.rootAbs(A.LEGACY.notesImages, fn)], '')
        if (!src || typeof src === 'object') {
          rep.broken.push({ 类别: '记事附件', 记录: n.id, 引用: url, 原因: src ? '同名多份' : '磁盘上找不到文件（可能是已删除记事的图）' })
          out.push(url); continue
        }
        // 序号接着目录里已有的往下排，避免覆盖
        if (!seq) seq = A.nextSequenceIn(dayDir, '图片') - 1
        seq++
        const destName = A.noteImageName(seq, fn)
        const destAbs = path.join(dayDir, destName)
        const r = A.copyVerified(src, destAbs)
        if (!r.ok) { rep.failed.push({ 类别: '记事附件', 记录: n.id, 原因: r.reason }); out.push(url); continue }
        used.add(src)
        if (path.resolve(src) !== path.resolve(destAbs)) toDelete.add(src)
        out.push(A.noteImageUrl(n.customer, day, destName))
        changed = true
        rep.migrated.记事附件++
      }
      if (changed) dbOps.push({ sql: 'UPDATE notes SET images = ? WHERE id = ?', params: [JSON.stringify(out), n.id] })
    }
  }

  // ===== 第 2 层：数据库改写 + 落盘（必须先于删源）=====
  for (const op of dbOps) execute(op.sql, op.params)
  if (dbOps.length) saveNow()      // 这里抛错就中止，源文件一个都还没删

  // ===== 第 3 层：确认落盘后才删源，再产出可读文件 =====
  for (const f of toDelete) if (A.removeSource(f)) rep.deletedSources++

  generateReadableFiles(rep)

  // —— 自检：DB 里每个引用都要能落到真实文件 ——
  verifyReferences(rep)

  // —— 旧目录还剩什么 ——
  for (const r of LEGACY_DIRS) {
    const left = walkFiles(A.rootAbs(r))
    if (!left.length) continue
    const unclaimed = left.filter(f => !used.has(path.resolve(f)))
    if (unclaimed.length) rep.orphans.push({ 目录: r, 文件数: unclaimed.length, 样例: unclaimed.slice(0, 5).map(f => path.basename(f)) })
    rep.oldDirsLeft.push(`${r}/ 还剩 ${left.length} 个文件`)
  }

  rep.finishedAt = new Date()
  try { fs.writeFileSync(A.rootAbs('客户资料归档报告.txt'), formatReport(rep), 'utf8') } catch { /* 报告写不出不影响搬家本身 */ }
  return rep
}

// ===== 可读文件：记事.txt + 物料清单.xlsx =====

const PRIORITY_TEXT = { 1: '高', 2: '中', 3: '低' }
const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }

function fmtTime(s) { return String(s || '').replace('T', ' ').slice(0, 19) }

function noteTxtContent(customer, date, notes) {
  const L = []
  L.push('='.repeat(60))
  L.push(`客户：${customer || '（未填客户）'}`)
  L.push(`日期：${date}`)
  L.push('='.repeat(60))
  notes.forEach((n, i) => {
    L.push('')
    L.push(`【${i + 1}】${fmtTime(n.created_at)}${n.updated_at && n.updated_at !== n.created_at ? `（改于 ${fmtTime(n.updated_at)}）` : ''}`)
    L.push(`标题：${n.title || '（无标题）'}`)
    L.push(`分类：${n.category_name || '—'}    优先级：${PRIORITY_TEXT[n.priority] || '中'}    状态：${STATUS_TEXT[n.status] || n.status || ''}`)
    L.push('-'.repeat(60))
    L.push(String(n.content || '').trim() || '（无内容）')
    const imgs = parseJsonArray(n.images).map(u => A.filenameFromUrl(u)).filter(Boolean)
    if (imgs.length) { L.push('-'.repeat(60)); L.push('图片：' + imgs.join('、')) }
  })
  L.push('')
  return L.join('\r\n')
}

const toMs = (s) => Date.parse(String(s || '').replace(' ', 'T')) || 0

/** 文件不存在、或比数据库内容旧 → 需要重做。所以按下按钮时通常什么都不用写 */
function needsRebuild(fileAbs, newestSourceTime) {
  try {
    if (!fs.existsSync(fileAbs)) return true
    return fs.statSync(fileAbs).mtimeMs < newestSourceTime
  } catch { return true }
}

function generateReadableFiles(rep) {
  // 重新查一遍：上面的搬迁刚改过 images 字段，不能拿旧快照去写 txt
  const notes = queryAll(`
    SELECT n.id, n.customer, n.created_at, n.updated_at, n.title, n.content,
           n.priority, n.status, n.images, c.name AS category_name
    FROM notes n LEFT JOIN note_categories c ON n.category_id = c.id AND c.is_deleted = 0
    WHERE n.is_deleted = 0`)

  // 记事.txt：按 客户 + 日期，一天一份，多条记事内部分节
  const groups = new Map()
  for (const n of notes) {
    const key = (n.customer || '') + '|' + dayOf(n.created_at)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(n)
  }
  for (const [key, list] of groups) {
    const sep = key.lastIndexOf('|')
    const customer = key.slice(0, sep), date = key.slice(sep + 1)
    list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id)
    const fileAbs = path.join(A.customerNoteDayDirAbs(customer, date), '记事.txt')
    const newest = list.reduce((m, n) => Math.max(m, toMs(n.updated_at || n.created_at)), 0)
    if (!needsRebuild(fileAbs, newest)) continue
    try {
      A.ensureDir(path.dirname(fileAbs))
      fs.writeFileSync(fileAbs, noteTxtContent(customer, date, list), 'utf8')
      rep.generated.记事txt++
    } catch (e) { rep.failed.push({ 类别: '记事.txt', 记录: key, 原因: e.message }) }
  }

  // 物料清单.xlsx：按客户
  const mats = queryAll('SELECT customer, created_at, updated_at FROM customer_materials WHERE is_deleted = 0')
  const newestOf = new Map()
  for (const m of mats) {
    const c = m.customer || ''
    if (!c) continue
    newestOf.set(c, Math.max(newestOf.get(c) || 0, toMs(m.updated_at || m.created_at)))
  }
  for (const [customer, newest] of newestOf) {
    const fileAbs = path.join(A.customerDirAbs(customer), A.DIR.archiveList)
    if (!needsRebuild(fileAbs, newest)) continue
    try {
      A.ensureDir(path.dirname(fileAbs))
      fs.writeFileSync(fileAbs, exportMaterials(customer))
      rep.generated.物料清单++
    } catch (e) { rep.failed.push({ 类别: '物料清单.xlsx', 记录: customer, 原因: e.message }) }
  }
}

// ===== 自检：数据库引用 vs 磁盘 =====

export function verifyReferences(rep = freshReport()) {
  const check = (url, label, id) => {
    if (!url) return
    const hit = A.resolveUrl(url)
    if (!hit) { rep.broken.push({ 类别: label, 记录: id, 引用: url, 原因: 'URL 无法解析成磁盘路径' }); return }
    if (!fs.existsSync(hit.abs)) rep.broken.push({ 类别: label, 记录: id, 引用: url, 原因: '磁盘上没有这个文件' })
  }
  for (const m of queryAll('SELECT id, spec_document, remark_images FROM customer_materials WHERE is_deleted = 0')) {
    check(m.spec_document, '客户物料规格书', m.id)
    for (const u of parseJsonArray(m.remark_images)) check(u, '客户物料图片', m.id)
  }
  for (const p of queryAll('SELECT id, spec_document, remark_images FROM material_prices WHERE is_deleted = 0')) {
    check(p.spec_document, '报价规格书', p.id)
    for (const u of parseJsonArray(p.remark_images)) check(u, '报价备注图', p.id)
  }
  for (const n of queryAll('SELECT id, images FROM notes WHERE is_deleted = 0')) {
    for (const u of parseJsonArray(n.images)) check(u, '记事附件', n.id)
  }
  return rep
}

// ===== 报告 =====

function formatReport(rep) {
  const L = []
  L.push('客户资料归档报告')
  L.push(`生成时间：${rep.finishedAt ? rep.finishedAt.toLocaleString('zh-CN') : ''}`)
  L.push('')
  if (rep.backupDir) L.push(`搬迁前备份：${path.relative(A.dataRoot(), rep.backupDir)}`)
  L.push('')
  L.push('【已归档】')
  let anyMigrated = false
  for (const [k, v] of Object.entries(rep.migrated)) if (v) { L.push(`  ${k}：${v} 个`); anyMigrated = true }
  if (!anyMigrated) L.push('  （无）')
  if (rep.deletedSources) L.push(`  清理旧位置的重复文件：${rep.deletedSources} 个`)
  L.push('')
  L.push('【生成的可读文件】')
  L.push(`  记事.txt：${rep.generated.记事txt} 份`)
  L.push(`  物料清单.xlsx：${rep.generated.物料清单} 份`)
  L.push('')
  if (rep.skipped) {
    L.push(`【跳过】客户名净化后撞车，未搬（需人工决定）：${rep.skipped} 条`)
    for (const c of rep.conflicts) L.push(`  文件夹「${c.文件夹}」← 客户名 ${c.客户名.map(n => `「${n}」`).join(' 与 ')}`)
    L.push('')
  }
  L.push(`【数据库指向的文件找不到】${rep.broken.length} 条`)
  for (const b of rep.broken.slice(0, 50)) L.push(`  ${b.类别} #${b.记录}：${b.引用} —— ${b.原因 || ''}`)
  if (rep.broken.length > 50) L.push(`  …（还有 ${rep.broken.length - 50} 条）`)
  L.push('')
  L.push(`【搬迁失败】${rep.failed.length} 条`)
  for (const f of rep.failed.slice(0, 50)) L.push(`  ${f.类别} #${f.记录}：${f.原因}`)
  if (rep.failed.length > 50) L.push(`  …（还有 ${rep.failed.length - 50} 条）`)
  L.push('')
  L.push('【旧目录里剩下的文件（没有记录引用，已原地保留）】')
  if (!rep.orphans.length) L.push('  无')
  for (const o of rep.orphans) L.push(`  ${o.目录}/：${o.文件数} 个，例如 ${o.样例.join('、')}`)
  L.push('')
  if (rep.oldDirsLeft.length) {
    L.push('【旧目录未清空（迁移后仍可只读访问，确认无误后可自行删除）】')
    for (const s of rep.oldDirsLeft) L.push(`  ${s}`)
    L.push('')
  }
  return L.join('\r\n')
}
