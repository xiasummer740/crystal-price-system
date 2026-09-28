/**
 * 客户资料归档 —— 路径助手 + 安全搬迁
 *
 * 全系统所有「归档区」的读写都从这里走，避免 URL / 磁盘路径两套规则各写各的。
 *
 * 归档区布局（相对 DATA_DIR）：
 *   客户管理/<客户>/规格书/<文件>            客户物料规格书
 *   客户管理/<客户>/物料图片/<文件>          客户物料备注图
 *   客户管理/<客户>/记事/<YYYY-MM-DD>/       记事附件（图片重命名为 图片N.ext）
 *   客户管理/<客户>/<客户>物料清单.xlsx      按 📁 客户目录 按钮时生成（带客户全名，单独拷出去也认得出）
 *   报价规格书/<品类>/<文件>                 报价系统规格书
 *   报价备注图/<文件>                        报价系统备注图
 *
 * 旧目录（只读兜底，迁移完成后应为空）：
 *   规格书/  记事图片库/  报价图片库/  客户物料图片库/
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ===== 归档区目录名 =====
export const DIR = {
  customers: '客户管理',
  unassigned: '_未分配客户',
  spec: '规格书',
  materialImage: '物料图片',
  notes: '记事',
  archiveList: '物料清单.xlsx',
  quoteSpec: '报价规格书',
  quoteImage: '报价备注图',
  backup: '备份'
}

// 旧目录名（迁移来源）
export const LEGACY = {
  spec: '规格书',
  notesImages: '记事图片库',
  priceImages: '报价图片库',
  materialImages: '客户物料图片库'
}

// ===== URL 前缀 ↔ 磁盘根目录 =====
const MOUNTS = [
  { prefix: '/api/cust/', root: DIR.customers },           // 客户管理/
  { prefix: '/api/quote-specs/', root: DIR.quoteSpec },    // 报价规格书/
  { prefix: '/api/quote-images/', root: DIR.quoteImage }   // 报价备注图/
]

// 旧 URL 前缀：迁移后保留只读，让没刷新到的旧页面不至于立刻 404
const LEGACY_MOUNTS = [
  { prefix: '/api/uploads/materials/', root: LEGACY.materialImages },
  { prefix: '/api/uploads/notes/', root: LEGACY.notesImages },
  { prefix: '/api/uploads/prices/', root: LEGACY.priceImages },
  { prefix: '/api/specs/', root: LEGACY.spec }
]

export function dataRoot() {
  return process.env.DATA_DIR || path.join(__dirname, '..', '..')
}

/** 数据目录下的绝对路径（不保证存在） */
export function rootAbs(...segs) {
  return path.join(dataRoot(), ...segs)
}

// ===== 名字净化 =====

// Windows 保留设备名：叫 NUL / CON 的文件夹建不出来，加个下划线绕开
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/**
 * 把任意字符串净化成**单个**路径段（不含分隔符）。
 * 空 / 全是非法字符 → fallback。
 */
export function safeSegment(name, fallback = DIR.unassigned) {
  let s = String(name ?? '')
    .replace(/[\x00-\x1f\x7f]/g, '')       // 控制字符
    .replace(/[<>:"|?*\\/]/g, '_')         // Windows 非法字符 + 路径分隔符
    .trim()
  // Windows 会静默吃掉结尾的点和空格 → 写进去的路径和读回来的对不上
  s = s.replace(/[. ]+$/, '')
  if (!s) return fallback
  if (RESERVED.test(s)) s += '_'
  return s
}

/** 客户名 → 文件夹名 */
export function customerFolder(customer) {
  return safeSegment(customer, DIR.unassigned)
}

/** 品类名 → 文件夹名（空 → 未分类） */
export function categoryFolder(category) {
  return safeSegment(category, '未分类')
}

// ===== 路径拼装 =====

/** 客户根目录：DATA_DIR/客户管理/<客户> */
export function customerDirAbs(customer) {
  return rootAbs(DIR.customers, customerFolder(customer))
}

/**
 * 物料清单文件名：`<客户全名>物料清单.xlsx`。
 * 前缀恒等于文件夹名 —— 文件被单独拷出去、打包发人时，看名字就知道是谁家的。
 */
export function archiveListName(customer) {
  return customerFolder(customer) + DIR.archiveList
}

/** 客户归档物料清单的绝对路径 */
export function customerArchiveListAbs(customer) {
  return path.join(customerDirAbs(customer), archiveListName(customer))
}

/**
 * 把目录里名字不对的物料清单归位成 `canonicalName`。
 * 「不对」包括两种：旧名 `物料清单.xlsx`，以及**上一个客户的名字**
 * —— 客户改名/合并时 materials.js 的 moveInto 是连名带内容原样搬的，
 * 不归位的话新目录里会一直顶着别人家的名字，恰好吃掉这个功能的用意。
 *
 * **只改名，不删文件**。两种情形**一律不动、原样留着**交给调用方登记：
 * ① 正名已被占用；② 候选不止一份（谁是本客户的从名字上判断不出来，readdir 顺序
 * 决定谁抢到正名 —— 那也是猜）。
 *
 * ⚠️ 单份候选时**确实会改名**，哪怕它顶着别家客户的名字。这是有意为之：客户改名/合并时
 * `moveInto` 是连名带内容搬的，这份就是本客户的清单、只是名字没跟上。**代价是**：
 * 若真有人把别家的清单误放进这个目录，也会被改名成这家的名字（内容不变）。
 * 所以调用方**必须把改名的原文件名写进报告**，让人能抽查出来 —— 只记个数等于没记。
 * @returns {{renamed: string[], kept: string[]}} 原文件名列表（不含路径）
 */
export function normalizeArchiveList(dirAbs, canonicalName) {
  const renamed = [], kept = []
  const candidates = fs.readdirSync(dirAbs)
    .filter(n => n !== canonicalName && n.endsWith(DIR.archiveList))
  if (!candidates.length) return { renamed, kept }

  const dst = path.join(dirAbs, canonicalName)
  // 正名已被占用：不覆盖 —— 宁可多一个，也不猜哪个对
  // 候选**不止一份**：谁是本客户的，从名字上判断不出来（可能是旧客户名，也可能是别人家的
  // 被误放进来的）。readdir 顺序决定谁抢到正名，换台机器就换人 —— 那也是「猜」。
  // 两种情形都原样留着，交给调用方登记进报告让人来看。
  if (fs.existsSync(dst) || candidates.length > 1) {
    kept.push(...candidates)
    return { renamed, kept }
  }

  fs.renameSync(path.join(dirAbs, candidates[0]), dst)
  renamed.push(candidates[0])
  return { renamed, kept }
}

export function customerSpecDirAbs(customer) { return path.join(customerDirAbs(customer), DIR.spec) }
export function customerImageDirAbs(customer) { return path.join(customerDirAbs(customer), DIR.materialImage) }
export function customerNoteDayDirAbs(customer, date) {
  return path.join(customerDirAbs(customer), DIR.notes, safeSegment(date, '未知日期'))
}
export function quoteSpecDirAbs(category) { return rootAbs(DIR.quoteSpec, categoryFolder(category)) }
export function quoteImageDirAbs() { return rootAbs(DIR.quoteImage) }

/** 确保目录存在并返回其绝对路径 */
export function ensureDir(abs) {
  if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true })
  return abs
}

// ===== URL 拼装 =====

function joinUrl(prefix, segs) {
  return prefix + segs.map(s => encodeURIComponent(String(s))).join('/')
}

export function customerSpecUrl(customer, filename) {
  return joinUrl('/api/cust/', [customerFolder(customer), DIR.spec, filename])
}
export function customerImageUrl(customer, filename) {
  return joinUrl('/api/cust/', [customerFolder(customer), DIR.materialImage, filename])
}
export function noteImageUrl(customer, date, filename) {
  return joinUrl('/api/cust/', [customerFolder(customer), DIR.notes, safeSegment(date, '未知日期'), filename])
}
export function quoteSpecUrl(category, filename) {
  return joinUrl('/api/quote-specs/', [categoryFolder(category), filename])
}
export function quoteImageUrl(filename) {
  return joinUrl('/api/quote-images/', [filename])
}

// ===== URL → 磁盘 =====

/**
 * URL → 磁盘绝对路径。
 * 解析不出来（前缀不认 / 非法路径段 / 越界）一律返回 null —— 调用方必须当成错误处理，
 * 绝不能「猜一个路径继续」。
 *
 * @param {string} url
 * @param {{ legacy?: boolean }} [opts] legacy=false 时不认旧前缀（用于「这文件该不该搬」的判断）
 */
export function resolveUrl(url, opts = {}) {
  const { legacy = true } = opts
  if (!url) return null
  const clean = String(url).split('?')[0].split('#')[0]

  const mounts = legacy ? [...MOUNTS, ...LEGACY_MOUNTS] : MOUNTS
  const mount = mounts.find(m => clean.startsWith(m.prefix))
  if (!mount) return null

  const rawRel = clean.slice(mount.prefix.length)
  if (!rawRel) return null

  // 先解码再切段：否则 %2F 能在解码后变出一个新的层级
  let decoded
  try { decoded = decodeURIComponent(rawRel) } catch { return null }

  const segs = decoded.split('/').filter(s => s !== '')
  if (!segs.length) return null
  // 解码之后再判越界，挡掉 %2e%2e 这类绕过
  for (const s of segs) {
    if (s === '.' || s === '..') return null
    if (s.includes('\\') || s.includes('\0')) return null
    if (s.includes(':')) return null                  // NTFS 备用数据流
    if (/[\x00-\x1f\x7f]/.test(s)) return null
  }

  const abs = path.join(dataRoot(), mount.root, ...segs)
  if (!insideRoot(abs)) return null
  return { abs, segs, rel: segs.join('/'), mount, isLegacy: LEGACY_MOUNTS.includes(mount) }
}

/** 该 URL 是否已经在归档区（新前缀） */
export function isArchivedUrl(url) {
  return !!resolveUrl(url, { legacy: false })
}

/** 磁盘绝对路径是否落在数据目录内 */
export function insideRoot(abs) {
  const root = path.resolve(dataRoot())
  const p = path.resolve(abs)
  return p === root || p.startsWith(root + path.sep)
}

// ===== 文件名工具 =====

/** 从 URL 取磁盘上的文件名（去查询串，解码） */
export function filenameFromUrl(url) {
  if (!url) return ''
  const clean = String(url).split('?')[0]
  // 先解码再切段，与 resolveUrl 同理：否则 %2F 解码后会变出新层级，
  // 「末段」拿到的其实是整段路径，调用方把它当文件名拼进目标目录 → 多套两层目录
  let decoded = clean
  try { decoded = decodeURIComponent(clean) } catch { /* 解不开就用原串切 */ }
  return decoded.split('/').filter(Boolean).pop() || ''
}

/** URL 里附带的显示名（?name=xxx），没有则回落到末段文件名 */
export function displayNameOf(url) {
  if (!url) return ''
  const m = String(url).match(/[?&]name=([^&]+)/)
  if (m) { try { return decodeURIComponent(m[1]) } catch { /* 落到下面 */ } }
  return filenameFromUrl(url)
}

/** 保留 URL 上的 ?name= 查询串（迁移改写路径时不能把它弄丢） */
export function querySuffixOf(url) {
  const i = String(url || '').indexOf('?')
  return i >= 0 ? String(url).slice(i) : ''
}

/** 净化上传文件名：修编码、去非法字符、去路径遍历、保留扩展名 */
export function safeFilename(originalName, fallbackBase = 'unnamed') {
  let name = String(originalName || '')
  // Windows 下 busboy 可能把 UTF-8 当 Latin-1 读，导致中文乱码
  try {
    const fixed = Buffer.from(name, 'binary').toString('utf8')
    if (!fixed.includes('�')) name = fixed
  } catch { /* 保持原样 */ }
  const ext = path.extname(name)
  let base = path.basename(name, ext)
  while (base.includes('..')) base = base.replace(/\.\.+/g, '')
  base = base.replace(/[\x00-\x1f\x7f<>:"|?*/\\]/g, '_').replace(/[. ]+$/, '').trim()
  if (!base) base = fallbackBase
  return base + ext
}

/** 扩展名（小写，带点） */
export function extOf(name) {
  return path.extname(String(name || '')).toLowerCase()
}

/** 判断是不是图片 */
export function isImageName(name) {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(extOf(name))
}

/**
 * 在目录里找一个不冲突的文件名：base.ext → base_2.ext → base_3.ext …
 * 用于搬迁时不覆盖已有文件。
 */
export function uniqueNameIn(dir, filename) {
  if (!fs.existsSync(path.join(dir, filename))) return filename
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  for (let i = 2; i < 10000; i++) {
    const cand = `${base}_${i}${ext}`
    if (!fs.existsSync(path.join(dir, cand))) return cand
  }
  return `${base}_${Date.now()}${ext}`
}

/** 目录里同前缀的下一个序号（用于 图片1.png → 2） */
export function nextSequenceIn(dir, prefix = '图片') {
  let max = 0
  if (fs.existsSync(dir)) {
    const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)\\.[^.]+$', 'i')
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(re)
      if (m) max = Math.max(max, Number(m[1]))
    }
  }
  return max + 1
}

/** 图片在日期目录里的规范名：图片1.png / 图片2.jpg */
export function noteImageName(index, originalName) {
  return `图片${index}${extOf(originalName) || '.png'}`
}

// ===== 搬迁原子操作 =====

/**
 * 复制文件到目标处（带校验）。
 * **不动源文件** —— 删源是调用方在「数据库已落盘」之后才做的事。
 *
 * @returns {{ ok: boolean, skipped?: string, reason?: string }}
 */
export function copyVerified(srcAbs, destAbs) {
  try {
    if (!fs.existsSync(srcAbs)) return { ok: false, reason: '源文件不存在' }
    if (path.resolve(srcAbs) === path.resolve(destAbs)) return { ok: true, skipped: '同路径' }
    ensureDir(path.dirname(destAbs))
    if (fs.existsSync(destAbs)) {
      const a = fs.statSync(srcAbs), b = fs.statSync(destAbs)
      if (a.size === b.size) return { ok: true, skipped: '目标已存在且大小一致' }
      return { ok: false, reason: `目标已存在且大小不同（源 ${a.size} / 目标 ${b.size}）` }
    }
    fs.copyFileSync(srcAbs, destAbs)
    // 复制后核对：别信「没抛异常」就等于写对了
    const a = fs.statSync(srcAbs), b = fs.statSync(destAbs)
    if (a.size !== b.size) {
      try { fs.unlinkSync(destAbs) } catch { /* 删不掉就留着，报告里会体现 */ }
      return { ok: false, reason: `复制后大小不一致（源 ${a.size} / 目标 ${b.size}）` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

/** 删除源文件（搬迁成功后的收尾）。删不掉不算失败，只是留个副本 */
export function removeSource(srcAbs) {
  try {
    if (fs.existsSync(srcAbs)) fs.unlinkSync(srcAbs)
    return true
  } catch { return false }
}

/** 目录是否为空（不存在也算空） */
export function isEmptyDir(abs) {
  try {
    if (!fs.existsSync(abs)) return true
    return fs.readdirSync(abs).length === 0
  } catch { return false }
}

/**
 * 把一组附件 URL 挪到目标位置（保存记录时用）。
 *
 * 解决这个场景：用户先传图拿到 URL，之后又改了客户名 —— 图还留在老客户的目录里。
 * 保存时调一次，图和记录就对上了；文件本来就在位则只统一 URL 写法。
 *
 * @param {string[]} urls 现有附件 URL
 * @param {(filename: string, index: number) => string} buildUrl 目标 URL 构造器
 * @returns {{ urls: string[], moved: number, failed: string[] }}
 */
export function rehomeFiles(urls, buildUrl) {
  const out = []
  let moved = 0
  const failed = []
  const list = Array.isArray(urls) ? urls : []
  for (let i = 0; i < list.length; i++) {
    const url = list[i]
    const target = buildUrl(filenameFromUrl(url), i)
    const want = resolveUrl(target, { legacy: false })
    const have = resolveUrl(url)
    if (!want || !have) { out.push(url); continue }          // 认不出的 URL 原样留着，不猜
    if (want.abs === have.abs) { out.push(target); continue } // 已在位
    if (!fs.existsSync(have.abs)) {
      // 源不在：可能之前已搬过 → 目标处有就算成功
      if (fs.existsSync(want.abs)) { out.push(target); continue }
      failed.push(url)
      out.push(url)
      continue
    }
    const r = copyVerified(have.abs, want.abs)
    if (!r.ok) { failed.push(url); out.push(url); continue }
    removeSource(have.abs)
    out.push(target)
    moved++
  }
  return { urls: out, moved, failed }
}
