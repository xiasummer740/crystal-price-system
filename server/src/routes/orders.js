/**
 * 生成订单（供货合同）—— 路由
 *
 * 需求（祥哥 2026-10-22）：
 *   1. 软件里点「生成订单」，选不同客户，自动带出该客户信息；
 *   2. 生成的文件存到 <数据目录>/客户管理/<客户>/订单/日期+物料型号+数量.xlsx
 *   3. 模板照 `靖邦-晶科鑫订单JB260310001.xls`，公章要带进去；
 *   4. 部分信息（公司抬头、地址、联系人、数量、单价、交期、结算方式等）可改。
 *
 * 落位与「📁 客户目录」按钮、归档逻辑共用 customerArchive 的同一套路径规则，
 * 避免又出现「写在一处、找在另一处」。
 */
import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { queryAll, queryOne, execute, saveNow } from '../db.js'
import * as A from '../utils/customerArchive.js'
import { buildOrderXlsx } from '../utils/orderDoc.js'
import { xlsxToPdf } from '../utils/xlsxToPdf.js'
import { guessShortName, buildOrderNo, orderFileName, chineseShort } from '../utils/orderNumber.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = express.Router()

const SETTINGS_KEY = 'order_defaults'

// 样张里的我方（甲方）信息 —— 首次使用、还没保存过默认值时的兜底
const SUPPLIER_DEFAULTS = {
  name: '深圳市晶科鑫实业有限公司',
  address: '深圳市龙岗区坂田街道雪岗路2018号天安云谷产业园一期3栋C座12楼1204-1206室',
  contact: '夏祥',
  phone: '19168958953',
  email: 'sales034@q-crystal.com'
}

// 样张里可改的条款值（六~九）
const TERM_DEFAULTS = {
  deliveryPlace: '快 递',
  freight: '由甲方承担',
  acceptance: '收到货15天内',
  settlement: '现金'
}

const SEAL_PREFIX = '公章'
const SEAL_EXTS = ['.png', '.jpg', '.jpeg', '.webp']

function templateDir() {
  return A.ensureDir(A.rootAbs('模板'))
}

function loadDefaults() {
  let saved = {}
  try {
    const row = queryOne('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY])
    if (row?.value) saved = JSON.parse(row.value) || {}
  } catch { /* 坏 JSON 就当没存过 */ }
  return {
    supplier: { ...SUPPLIER_DEFAULTS, ...(saved.supplier || {}) },
    terms: { ...TERM_DEFAULTS, ...(saved.terms || {}) }
  }
}

function saveDefaults(patch = {}) {
  const cur = loadDefaults()
  const next = {
    supplier: { ...cur.supplier, ...(patch.supplier || {}) },
    terms: { ...cur.terms, ...(patch.terms || {}) }
  }
  execute('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [SETTINGS_KEY, JSON.stringify(next)])
  return next
}

/** 找到用户自己上传的印章（没有则 null） */
function findCustomSeal() {
  try {
    const dir = templateDir()
    for (const f of fs.readdirSync(dir)) {
      const ext = path.extname(f).toLowerCase()
      if (path.basename(f, ext) === SEAL_PREFIX && SEAL_EXTS.includes(ext)) {
        return path.join(dir, f)
      }
    }
  } catch { /* 目录读不到 = 没上传过 */ }
  return null
}

function bundledSeal() {
  // 内置公章：从「晶科鑫报价单2026-5-20后.docx」里取出来的公司公章（透明 PNG，363×364）
  return path.join(__dirname, '..', '..', 'assets', 'seal-jkx.png')
}

function currentSeal() {
  const custom = findCustomSeal()
  if (custom) {
    return { abs: custom, custom: true, extension: path.extname(custom).toLowerCase() === '.png' ? 'png' : 'jpeg' }
  }
  return { abs: bundledSeal(), custom: false, extension: 'png' }
}

function sealUrl() {
  const seal = currentSeal()
  let v = 1
  try { v = Math.round(fs.statSync(seal.abs).mtimeMs) } catch {}
  return `/api/orders/seal?v=${v}`
}

/** 客户 → 订单目录 <数据目录>/客户管理/<客户>/订单（路径规则只在 customerArchive 一处） */
function orderDir(customer) {
  return A.customerOrderDirAbs(customer)
}

function todayStr() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function normalizeDate(s) {
  const t = String(s || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : todayStr()
}

/** 该客户当天已用到的最大序号（从「xx-晶科鑫订单<单号>.xlsx」里解析 001~999） */
function dayUsed(customer, dateStr) {
  const ymd = String(dateStr || '').slice(2).replace(/\D/g, '')   // YYMMDD
  const dir = orderDir(customer)
  let max = 0
  try {
    if (!fs.existsSync(dir)) return 0
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/-晶科鑫订单[A-Za-z0-9]*(\d{6})(\d{3})\.xlsx$/i)
      if (m && m[1] === ymd) max = Math.max(max, Number(m[2]))
    }
  } catch { /* 读不到就当没用过 */ }
  return max
}

/** 读客户绑定的订单资料（简称 + 乙方信息 + 六~九条款） */
function readOrderProfile(customer) {
  try {
    const row = queryOne('SELECT short_name, order_profile FROM customers WHERE name = ?', [customer])
    let prof = {}
    if (row?.order_profile) {
      try { prof = JSON.parse(row.order_profile) || {} } catch { prof = {} }
    }
    return {
      shortName: String(row?.short_name || '').trim(),
      fileShort: String(prof.fileShort || '').trim(),
      priceMode: prof.priceMode === '未税' ? '未税' : '含税',
      buyer: prof.buyer && typeof prof.buyer === 'object' ? prof.buyer : null,
      terms: prof.terms && typeof prof.terms === 'object' ? prof.terms : null
    }
  } catch {
    return { shortName: '', fileShort: '', priceMode: '含税', buyer: null, terms: null }
  }
}

const clip = (v, n) => String(v ?? '').trim().slice(0, n)

/** 保存客户绑定的订单资料（乙方信息 + 条款 + 简称 + 文件名前缀）——「保存默认」按钮走这里 */
function saveOrderProfile(customer, { shortName, fileShort, buyer, terms, priceMode } = {}) {
  const short = String(shortName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  const fileShortSafe = String(fileShort || '')
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 10)
  const profile = {
    fileShort: fileShortSafe,
    priceMode: priceMode === '未税' ? '未税' : '含税',
    buyer: {
      address: clip(buyer?.address, 200),
      contact: clip(buyer?.contact, 50),
      phone: clip(buyer?.phone, 50),
      fax: clip(buyer?.fax, 50)
    },
    terms: {
      deliveryPlace: clip(terms?.deliveryPlace, 50),
      freight: clip(terms?.freight, 50),
      acceptance: clip(terms?.acceptance, 50),
      settlement: clip(terms?.settlement, 50)
    }
  }
  try {
    execute('INSERT OR IGNORE INTO customers (name, source) VALUES (?, ?)', [customer, 'order'])
    execute('UPDATE customers SET short_name = ?, order_profile = ? WHERE name = ?', [short, JSON.stringify(profile), customer])
    saveNow()
  } catch (e) {
    console.warn('[orders] 保存客户订单资料失败:', e.message)
    throw e
  }
}

/** 已保存的客户简称 */
function savedShortName(customer) {
  return readOrderProfile(customer).shortName
}

/** 简称：存过的优先，没存过按公司名猜（见 utils/orderNumber.js），都猜不出用 KH 兜底 */
function resolveShortName(customer) {
  return savedShortName(customer) || guessShortName(customer) || 'KH'
}

/** 把客户简称记到名册（客户可能还没进 customers 表，先 INSERT OR IGNORE） */
function saveShortName(customer, shortName) {
  const s = String(shortName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  if (!s) return
  try {
    execute('INSERT OR IGNORE INTO customers (name, source) VALUES (?, ?)', [customer, 'order'])
    execute('UPDATE customers SET short_name = ? WHERE name = ?', [s, customer])
  } catch (e) {
    console.warn('[orders] 保存客户简称失败:', e.message)
  }
}

/** 下一个单号：<公司简称><YYMMDD><001~999>（按该客户当天已有订单数顺延） */
function nextOrderNo(customer, dateStr, shortName) {
  const seq = Math.min(999, dayUsed(customer, dateStr) + 1)
  return buildOrderNo(shortName || resolveShortName(customer), dateStr, seq)
}

/** 客户信息预填：地图模块里的客户/采购联系人/收货点优先，其次客户名册 */
function buyerPrefill(customer) {
  let mc = null
  let purchaser = null
  let site = null
  try {
    mc = queryOne('SELECT * FROM map_customers WHERE name = ?', [customer])
    if (!mc) {
      // 客户名可能只差个别写法，退一步用 LIKE 命中最长的那条
      mc = queryOne('SELECT * FROM map_customers WHERE name LIKE ? ORDER BY length(name) DESC LIMIT 1', [`%${customer}%`])
    }
    if (mc) {
      purchaser = queryOne(
        'SELECT * FROM map_purchasers WHERE customer_id = ? ORDER BY (default_site_id > 0) DESC, id LIMIT 1',
        [mc.id]
      )
      site = queryOne(
        'SELECT * FROM map_sites WHERE customer_id = ? ORDER BY is_default DESC, id LIMIT 1',
        [mc.id]
      )
    }
  } catch { /* 地图表缺失也不该挡住建单 */ }
  return {
    name: customer,
    address: purchaser?.address || site?.address || mc?.address || '',
    contact: purchaser?.name || '',
    phone: purchaser?.phone || mc?.phone || '',
    fax: ''
  }
}

/** 该客户的物料清单（给下拉用） */
function customerMaterials(customer) {
  const rows = queryAll(
    `SELECT id, date, customer_code, jkx_code, material_code, material_name, price, factory, customer_desc
       FROM customer_materials
      WHERE customer = ? AND is_deleted = 0
      ORDER BY date DESC, id DESC
      LIMIT 500`,
    [customer]
  )
  return rows.map(r => ({
    ...r,
    price_num: parsePrice(r.price)
  }))
}

function parsePrice(v) {
  const m = String(v ?? '').match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : 0
}

/**
 * 订单列表：同一份订单的 xlsx / pdf 合成一行（stem 相同），
 * 前端显示完整文件名（中波动光-晶科鑫订单ZBDG261022001）+ 两个下载入口。
 */
function listOrders(customer) {
  const dir = orderDir(customer)
  if (!fs.existsSync(dir)) return []
  const map = new Map()
  for (const f of fs.readdirSync(dir)) {
    const ext = path.extname(f).toLowerCase()
    if (!['.xlsx', '.pdf'].includes(ext) || f.startsWith('~$')) continue
    let st
    try { st = fs.statSync(path.join(dir, f)) } catch { continue }
    const stem = path.basename(f, ext)
    if (!map.has(stem)) map.set(stem, { stem, xlsx: '', pdf: '', mtime: '' })
    const o = map.get(stem)
    o[ext.slice(1)] = f
    const iso = st.mtime.toISOString()
    if (iso > o.mtime) o.mtime = iso
  }

  const out = []
  for (const o of map.values()) {
    let date = ''
    let orderNo = ''
    let model = ''
    let qty = ''
    // 新命名：中波动光-晶科鑫订单ZBDG261022001
    const mNew = o.stem.match(/-晶科鑫订单([A-Za-z0-9]+)$/)
    if (mNew) {
      orderNo = mNew[1]
      const dm = orderNo.match(/^[A-Za-z]*(\d{6})(\d{3})$/)
      if (dm) date = `20${dm[1].slice(0, 2)}-${dm[1].slice(2, 4)}-${dm[1].slice(4, 6)}`
    } else {
      // 旧命名（兼容测试期间生成的文件）：日期+型号+数量
      const parts = o.stem.split('+')
      date = parts[0] || ''
      model = parts.length >= 3 ? parts.slice(1, -1).join('+') : (parts[1] || '')
      const last = parts[parts.length - 1] || ''
      const qm = last.match(/\d+(?:\.\d+)?/)
      qty = qm ? qm[0] : ''
    }
    out.push({ ...o, date, orderNo, model, qty })
  }
  out.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
  return out
}

// ===== 选项（页面打开 / 选客户时调）=====
router.get('/options', (req, res) => {
  try {
    const customer = String(req.query.customer || '').trim()
    const { supplier, terms: globalTerms } = loadDefaults()
    const prof = customer ? readOrderProfile(customer) : { shortName: '', fileShort: '', buyer: null, terms: null }
    const shortName = customer ? (prof.shortName || guessShortName(customer) || 'KH') : ''
    // 客户存过条款就用客户的，没存过用全局默认
    const terms = prof.terms ? { ...globalTerms, ...prof.terms } : globalTerms
    const data = {
      supplier,
      terms,
      seal: { custom: currentSeal().custom, url: sealUrl() },
      today: todayStr(),
      shortName,
      // 文件名前缀（中文）：客户存过的优先，没存过按公司核心字号猜（2 字，界面可改成 3/4 字）
      fileShort: customer ? (prof.fileShort || chineseShort(customer) || shortName) : '',
      priceMode: prof.priceMode || '含税',
      nextOrderNo: customer ? nextOrderNo(customer, todayStr(), shortName) : '',
      // 客户存过乙方资料就用存过的（空字段也算数，不再被地图资料盖掉），没存过才预填
      buyer: customer
        ? (prof.buyer ? { name: customer, ...prof.buyer } : buyerPrefill(customer))
        : null,
      materials: customer ? customerMaterials(customer) : [],
      recent: customer ? listOrders(customer).slice(0, 10) : []
    }
    res.json({ code: 0, data })
  } catch (e) {
    console.error('[orders/options]', e)
    res.status(500).json({ code: 1, msg: '读取订单选项失败: ' + e.message })
  }
})

// ===== 生成 / 预览 =====
// preview=true 时只把同一份合同渲染成 PDF 直接回给浏览器（不落盘、不占单号），
// 生成和预览共用一套组装逻辑，避免「预览和正式长得不一样」。
async function generateHandler(req, res, preview = false) {
  try {
    const body = req.body || {}
    const customer = String(body.customer || '').trim()
    if (!customer) return res.status(400).json({ code: 1, msg: '请先选择客户' })

    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) return res.status(400).json({ code: 1, msg: '请至少添加一条物料' })
    if (items.length > 30) return res.status(400).json({ code: 1, msg: '一次最多 30 条物料' })

    const cleanItems = []
    for (const it of items) {
      const spec = String(it.spec ?? '').trim()
      const code = String(it.code ?? '').trim()
      if (!spec && !code) return res.status(400).json({ code: 1, msg: '有一条物料没填型号/规格' })
      const qty = Number(it.qty)
      const price = Number(it.price)
      if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ code: 1, msg: '数量必须是大于 0 的数字' })
      if (!Number.isFinite(price) || price < 0) return res.status(400).json({ code: 1, msg: '单价必须是不小于 0 的数字' })
      cleanItems.push({
        jkx_code: String(it.jkx_code || '').trim(),
        code,
        spec,
        qty,
        price,
        deliveryDate: String(it.deliveryDate || '').trim(),
        remark: String(it.remark || '')
      })
    }

    const signDate = normalizeDate(body.signDate)
    const shortName = String(body.shortName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
      || resolveShortName(customer)
    const orderNo = String(body.orderNo || '').trim() || nextOrderNo(customer, signDate, shortName)
    const supplier = { ...SUPPLIER_DEFAULTS, ...(loadDefaults().supplier || {}), ...(body.supplier || {}) }
    const terms = { ...TERM_DEFAULTS, ...(loadDefaults().terms || {}), ...(body.terms || {}) }
    const buyer = { name: customer, ...(body.buyer || {}) }
    const priceMode = String(body.priceMode || '').includes('未') ? '未税' : '含税'

    const seal = currentSeal()
    let sealBuffer = null
    if (body.showSeal !== false) {
      try { sealBuffer = fs.readFileSync(seal.abs) } catch { sealBuffer = null }
    }
    // 左上角品牌 logo（固定资源，不随客户变）
    let logoBuffer = null
    try { logoBuffer = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'sjk-logo.png')) } catch { logoBuffer = null }

    const buffer = await buildOrderXlsx({
      orderNo,
      signDate,
      supplier,
      buyer,
      items: cleanItems,
      terms,
      sign: { supplierRep: body.sign?.supplierRep || supplier.contact },
      priceMode,
      showSeal: body.showSeal !== false
    }, {
      seal: sealBuffer ? { buffer: sealBuffer, extension: seal.extension } : null,
      logo: logoBuffer ? { buffer: logoBuffer, extension: 'png' } : null
    })

    // ===== 预览：同一份合同渲染成 PDF 直接回浏览器，不落盘、不占单号 =====
    if (preview) {
      const tmpBase = path.join(os.tmpdir(), `crystal-order-preview-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      const tmpXlsx = tmpBase + '.xlsx'
      const tmpPdf = tmpBase + '.pdf'
      try {
        fs.writeFileSync(tmpXlsx, buffer)
        await xlsxToPdf(tmpXlsx, tmpPdf)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', 'inline; filename="order-preview.pdf"')
        res.sendFile(tmpPdf, () => {
          setTimeout(() => {
            try { fs.unlinkSync(tmpPdf) } catch {}
            try { fs.unlinkSync(tmpXlsx) } catch {}
          }, 5000)
        })
      } catch (e) {
        try { fs.unlinkSync(tmpXlsx) } catch {}
        console.error('[orders/preview]', e)
        res.status(500).json({ code: 1, msg: '预览生成失败: ' + (e.message || '未知错误') })
      }
      return
    }

    const dir = A.ensureDir(orderDir(customer))
    const totalQty = cleanItems.reduce((a, b) => a + Number(b.qty), 0)
    // 文件名：<客户中文简称>-晶科鑫订单<订单编号>.xlsx（祥哥 2026-10-22 定）
    // 简称 2/3/4 字都行：界面里可改，存到客户档案；没存过才按核心字号猜
    const fileShort = String(body.fileShort || '').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '').trim().slice(0, 10)
      || readOrderProfile(customer).fileShort
      || chineseShort(customer)
      || shortName
    const fileName = A.uniqueNameIn(dir, orderFileName(fileShort, orderNo))
    const abs = path.join(dir, fileName)

    // 先写临时文件再改名：中途崩掉不会留下半个 xlsx
    const tmp = abs + '.tmp'
    fs.writeFileSync(tmp, buffer)
    fs.renameSync(tmp, abs)
    const st = fs.statSync(abs)

    // 记住客户简称：下一单直接用同一前缀（用户手改过的也记住）
    saveShortName(customer, shortName)

    // 同时导出一份 PDF（直接发客户用）。失败不影响 xlsx：把原因带回前端
    let pdfName = ''
    let pdfError = ''
    try {
      const pdfAbs = abs.replace(/\.xlsx$/i, '.pdf')
      await xlsxToPdf(abs, pdfAbs)
      pdfName = path.basename(pdfAbs)
    } catch (e) {
      pdfError = e.message || 'PDF 导出失败'
      console.warn('[orders] PDF 导出失败（xlsx 已生成）:', pdfError)
    }

    const relPath = path.join(A.DIR.customers, A.customerFolder(customer), '订单', fileName)
    res.json({
      code: 0,
      data: {
        fileName,
        pdfName,
        pdfError,
        absPath: abs,
        relPath,
        orderNo,
        shortName,
        fileShort,
        priceMode,
        total: Math.round(cleanItems.reduce((a, b) => a + Number(b.qty) * Number(b.price), 0) * 100) / 100,
        totalQty,
        size: st.size
      }
    })
  } catch (e) {
    console.error('[orders/generate]', e)
    res.status(500).json({ code: 1, msg: '生成订单失败: ' + e.message })
  }
}

router.post('/generate', (req, res) => generateHandler(req, res, false))
router.post('/preview', (req, res) => generateHandler(req, res, true))

// ===== 历史订单 =====
router.get('/list', (req, res) => {
  try {
    const customer = String(req.query.customer || '').trim()
    if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })
    res.json({ code: 0, data: listOrders(customer) })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '读取订单列表失败: ' + e.message })
  }
})

// ===== 下载（浏览器/手机也能拿到文件）=====
router.get('/download', (req, res) => {
  try {
    const customer = String(req.query.customer || '').trim()
    const name = String(req.query.name || '').trim()
    if (!customer || !name) return res.status(400).json({ code: 1, msg: '参数不完整' })
    if (path.basename(name) !== name) return res.status(400).json({ code: 1, msg: '文件名不合法' })
    const abs = path.join(orderDir(customer), name)
    const ext = path.extname(abs).toLowerCase()
    if (!['.xlsx', '.pdf'].includes(ext) || !fs.existsSync(abs)) {
      return res.status(404).json({ code: 1, msg: '订单文件不存在' })
    }
    res.setHeader('Content-Type', ext === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    // inline=1：PDF 直接在浏览器里预览（不再强制下载）
    const inline = String(req.query.inline || '') === '1' && ext === '.pdf'
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`)
    res.sendFile(abs)
  } catch (e) {
    res.status(500).json({ code: 1, msg: '下载失败: ' + e.message })
  }
})

// ===== 复制文件到剪贴板（可直接粘到微信/QQ）=====
// 浏览器 Clipboard API 只支持图片/文本，PDF 这种要在系统层做 CF_HDROP —— 用 PowerShell 的
// Set-Clipboard -Path 把「文件」放剪贴板，效果和资源管理器里右键复制一样。
router.post('/copy', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const name = String(req.body?.name || '').trim()
    if (!customer || !name) return res.status(400).json({ code: 1, msg: '参数不完整' })
    if (path.basename(name) !== name) return res.status(400).json({ code: 1, msg: '文件名不合法' })
    const abs = path.join(orderDir(customer), name)
    const ext = path.extname(abs).toLowerCase()
    if (!['.xlsx', '.pdf'].includes(ext) || !fs.existsSync(abs)) {
      return res.status(404).json({ code: 1, msg: '订单文件不存在' })
    }
    if (process.platform !== 'win32') {
      return res.status(400).json({ code: 1, msg: '只有 Windows 桌面版支持复制文件' })
    }
    const script = `Set-Clipboard -Path '${abs.replace(/'/g, "''")}'`
    const b64 = Buffer.from(script, 'utf16le').toString('base64')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
      { timeout: 20000, windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) return res.status(500).json({ code: 1, msg: '复制失败: ' + ((stderr || err.message || '').trim() || '未知错误') })
        res.json({ code: 0, data: { name, path: abs } })
      }
    )
  } catch (e) {
    res.status(500).json({ code: 1, msg: '复制失败: ' + e.message })
  }
})

// ===== 桌面端：打开文件 / 打开所在文件夹 =====
router.post('/open', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const name = String(req.body?.name || '').trim()
    const mode = String(req.body?.mode || 'file')      // file=选中文件 / folder=只开目录
    if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })

    let target = orderDir(customer)
    if (mode === 'file') {
      if (!name || path.basename(name) !== name) return res.status(400).json({ code: 1, msg: '文件名不合法' })
      target = path.join(target, name)
      if (!['.xlsx', '.pdf'].includes(path.extname(target).toLowerCase())) {
        return res.status(400).json({ code: 1, msg: '只支持打开 xlsx / pdf' })
      }
      if (!fs.existsSync(target)) return res.status(404).json({ code: 1, msg: '订单文件不存在' })
    } else {
      A.ensureDir(target)
    }

    if (process.platform === 'win32') {
      if (mode === 'file') execFile('explorer.exe', [`/select,${target}`])
      else execFile('explorer.exe', [target])
    }
    res.json({ code: 0, data: { path: target } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '打开失败: ' + e.message })
  }
})

// ===== 印章：读取 / 上传 / 恢复默认 =====
router.get('/seal', (req, res) => {
  try {
    const seal = currentSeal()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', seal.extension === 'png' ? 'image/png' : 'image/jpeg')
    res.sendFile(seal.abs)
  } catch {
    res.status(404).end()
  }
})

const sealUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return cb(null, true)
    cb(new Error('印章只能是 PNG / JPG 图片'))
  }
})

router.post('/seal', (req, res) => {
  sealUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ code: 1, msg: err.message || '上传失败' })
    if (!req.file) return res.status(400).json({ code: 1, msg: '请选择印章图片' })
    try {
      const oldExt = path.extname(req.file.originalname || '').toLowerCase()
      const ext = oldExt === '.png' ? '.png' : oldExt === '.webp' ? '.webp' : '.jpg'
      // 先删旧的，保证「公章.*」只有一份
      for (const f of fs.readdirSync(templateDir())) {
        const e = path.extname(f).toLowerCase()
        if (path.basename(f, e) === SEAL_PREFIX) {
          try { fs.unlinkSync(path.join(templateDir(), f)) } catch {}
        }
      }
      fs.writeFileSync(path.join(templateDir(), SEAL_PREFIX + ext), req.file.buffer)
      res.json({ code: 0, data: { url: sealUrl(), custom: true } })
    } catch (e) {
      res.status(500).json({ code: 1, msg: '保存印章失败: ' + e.message })
    }
  })
})

router.post('/seal/reset', (_req, res) => {
  try {
    for (const f of fs.readdirSync(templateDir())) {
      const e = path.extname(f).toLowerCase()
      if (path.basename(f, e) === SEAL_PREFIX) {
        try { fs.unlinkSync(path.join(templateDir(), f)) } catch {}
      }
    }
    res.json({ code: 0, data: { url: sealUrl(), custom: false } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '恢复默认印章失败: ' + e.message })
  }
})

// ===== 保存默认值（一个按钮管两边）=====
//   甲方信息 → 全局默认
//   选了客户时：乙方信息 + 六~九条款 + 客户简称 → 绑定到该客户（customers.order_profile）
router.post('/defaults', (req, res) => {
  try {
    const body = req.body || {}
    const customer = String(body.customer || '').trim()
    // 没选客户时，条款也存成全局默认；选了客户，条款存到客户身上，不动全局
    const next = saveDefaults({
      supplier: body.supplier || {},
      terms: customer ? {} : (body.terms || {})
    })
    if (customer) saveOrderProfile(customer, body)
    res.json({ code: 0, data: { ...next, customer } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '保存默认值失败: ' + e.message })
  }
})

export default router
