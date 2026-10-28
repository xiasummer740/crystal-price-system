/**
 * 生成报价单（祥哥 2026-10-28）—— 参考订单模块的做法：
 *   选客户 → 带出 TO/ATTN/TEL 与客户物料 → 生成 .docx + .pdf → 落位 客户管理/<客户>/报价单/
 *
 * 模板：server/assets/quote-template.docx（由「晶科鑫报价单2026-5-20后.docx」预处理，
 * 保留 logo、公章、字体、条款，只把可变内容换成占位符）。
 */
import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { queryAll, queryOne } from '../db.js'
import * as A from '../utils/customerArchive.js'
import { buildQuoteDocx } from '../utils/quoteDoc.js'
import { docxToPdf } from '../utils/docxToPdf.js'
import { copyFileToClipboard } from '../utils/clipboardFile.js'
import { chineseShort } from '../utils/orderNumber.js'

const router = express.Router()
const FM_NAME = '夏祥'

function todayStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function yymmdd(date) {
  const m = String(date || todayStr()).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? m[1].slice(2) + m[2] + m[3] : todayStr().slice(2).replace(/-/g, '')
}
function quoteDir(customer) {
  return A.ensureDir(A.customerQuoteDirAbs(customer))
}

function readProfile(customer) {
  try {
    const row = queryOne('SELECT short_name, order_profile FROM customers WHERE name = ?', [customer])
    if (!row) return {}
    let prof = {}
    try { prof = row.order_profile ? JSON.parse(row.order_profile) : {} } catch {}
    return { ...prof, shortName: row.short_name || prof.shortName || '' }
  } catch { return {} }
}

/** 与订单模块同一套客户资料预填：地图客户 + 首要联系人 + 默认地址 */
function buyerPrefill(customer) {
  let mc = null
  let purchaser = null
  let site = null
  try {
    mc = queryOne('SELECT * FROM map_customers WHERE name = ?', [customer])
    if (!mc) mc = queryOne('SELECT * FROM map_customers WHERE name LIKE ? ORDER BY length(name) DESC LIMIT 1', [`%${customer}%`])
    if (mc) {
      purchaser = queryOne('SELECT * FROM map_purchasers WHERE customer_id = ? ORDER BY (default_site_id > 0) DESC, id LIMIT 1', [mc.id])
      site = queryOne('SELECT * FROM map_sites WHERE customer_id = ? ORDER BY is_default DESC, id LIMIT 1', [mc.id])
    }
  } catch {}
  return {
    name: customer,
    address: purchaser?.address || site?.address || mc?.address || '',
    contact: purchaser?.name || '',
    phone: purchaser?.phone || mc?.phone || ''
  }
}

function customerMaterials(customer) {
  return queryAll(
    `SELECT id, customer_code, jkx_code, material_code, material_name, price, factory
       FROM customer_materials WHERE customer = ? AND is_deleted = 0
      ORDER BY date DESC, id DESC LIMIT 500`,
    [customer]
  ).map(r => ({ ...r, price_num: parseFloat(String(r.price || '').replace(/[^\d.]/g, '')) || 0 }))
}

function listQuotes(customer) {
  const dir = quoteDir(customer)
  const map = new Map()
  for (const f of fs.readdirSync(dir)) {
    const ext = path.extname(f).toLowerCase()
    if (!['.docx', '.pdf'].includes(ext) || f.startsWith('~$')) continue
    let st
    try { st = fs.statSync(path.join(dir, f)) } catch { continue }
    const stem = path.basename(f, ext)
    if (!map.has(stem)) map.set(stem, { stem, docx: '', pdf: '', mtime: '' })
    const o = map.get(stem)
    o[ext.slice(1)] = f
    const iso = st.mtime.toISOString()
    if (iso > o.mtime) o.mtime = iso
  }
  return [...map.values()].map(o => {
    const m = o.stem.match(/(\d{6})(?:-(\d+))?$/)
    let date = ''
    if (m) date = `20${m[1].slice(0, 2)}-${m[1].slice(2, 4)}-${m[1].slice(4, 6)}`
    return { ...o, date }
  }).sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
}

function nextSeq(customer, date) {
  const dir = quoteDir(customer)
  const tag = `-晶科鑫报价单${yymmdd(date)}-`
  let max = 0
  for (const f of fs.readdirSync(dir)) {
    if (!f.includes(tag)) continue
    const m = f.match(/-(\d+)\.(docx|pdf)$/i)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return String(max + 1).padStart(2, '0')
}

function normalizeItems(items) {
  return (items || []).slice(0, 30).map(it => ({
    customer_code: String(it.customer_code || '').trim(),
    jkx_code: String(it.jkx_code || '').trim(),
    spec: String(it.spec || '').trim(),
    price: it.price === '' || it.price == null ? '' : Number(it.price),
    qty: String(it.qty || '').trim(),
    lt: String(it.lt || '').trim(),
    remark: String(it.remark || '').trim()
  })).filter(it => it.spec || it.jkx_code)
}

function quotePayload(body) {
  const customer = String(body.customer || '').trim()
  if (!customer) throw new Error('请先选择客户')
  const date = String(body.date || todayStr()).slice(0, 10)
  const items = normalizeItems(body.items)
  if (!items.length) throw new Error('请至少添加一条物料')
  return {
    customer,
    date,
    to: String(body.to || customer).trim(),
    fm: String(body.fm || FM_NAME).trim(),
    attn: String(body.attn || '').trim(),
    tel: String(body.tel || '').trim(),
    terms: {
      settle: String(body.terms?.settle ?? '款到做货').trim() || '款到做货',
      lead: String(body.terms?.lead ?? '5-6周').trim() || '5-6周',
      valid: String(body.terms?.valid ?? '本报价单 30 天内有效').trim() || '本报价单 30 天内有效'
    },
    items
  }
}

router.get('/options', (req, res) => {
  try {
    const customer = String(req.query.customer || '').trim()
    const prof = customer ? readProfile(customer) : {}
    const pre = customer ? (prof.buyer ? { ...buyerPrefill(customer), ...prof.buyer, name: customer } : buyerPrefill(customer)) : null
    res.json({
      code: 0,
      data: {
        date: todayStr(),
        buyer: pre,
        materials: customer ? customerMaterials(customer) : [],
        fileShort: customer ? (prof.fileShort || chineseShort(customer) || prof.shortName) : '',
        fm: FM_NAME,
        recent: customer ? listQuotes(customer).slice(0, 10) : []
      }
    })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '读取报价选项失败: ' + e.message })
  }
})

router.post('/preview', async (req, res) => {
  try {
    const q = quotePayload(req.body || {})
    const buffer = buildQuoteDocx(q)
    const base = path.join(os.tmpdir(), `crystal-quote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
    const docx = base + '.docx'
    const pdf = base + '.pdf'
    try {
      fs.writeFileSync(docx, buffer)
      await docxToPdf(docx, pdf)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline; filename="quote-preview.pdf"')
      res.sendFile(pdf, () => setTimeout(() => {
        try { fs.unlinkSync(pdf) } catch {}
        try { fs.unlinkSync(docx) } catch {}
      }, 5000))
    } catch (e) {
      try { fs.unlinkSync(docx) } catch {}
      res.status(500).json({ code: 1, msg: '预览生成失败: ' + (e.message || '未知错误') })
    }
  } catch (e) {
    res.status(400).json({ code: 1, msg: e.message })
  }
})

router.post('/generate', async (req, res) => {
  try {
    const q = quotePayload(req.body || {})
    const buffer = buildQuoteDocx(q)
    const dir = quoteDir(q.customer)
    const short = String(req.body.fileShort || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 10)
      || readProfile(q.customer).fileShort || chineseShort(q.customer) || readProfile(q.customer).shortName
    const stem = `${short}-晶科鑫报价单${yymmdd(q.date)}-${nextSeq(q.customer, q.date)}`
    const docxName = A.uniqueNameIn(dir, stem + '.docx')
    const abs = path.join(dir, docxName)
    const tmp = abs + '.tmp'
    fs.writeFileSync(tmp, buffer)
    fs.renameSync(tmp, abs)

    let pdfName = ''
    let pdfError = ''
    try {
      const pdfAbs = abs.replace(/\.docx$/i, '.pdf')
      await docxToPdf(abs, pdfAbs)
      pdfName = path.basename(pdfAbs)
    } catch (e) {
      pdfError = e.message || 'PDF 导出失败'
      console.warn('[quotes] PDF 导出失败:', pdfError)
    }

    res.json({
      code: 0,
      data: {
        docxName,
        pdfName,
        pdfError,
        absPath: abs,
        relPath: path.join(A.DIR.customers, A.customerFolder(q.customer), A.DIR.quotes, docxName),
        date: q.date,
        count: q.items.length
      }
    })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '生成报价单失败: ' + e.message })
  }
})

router.get('/list', (req, res) => {
  try {
    const customer = String(req.query.customer || '').trim()
    if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })
    res.json({ code: 0, data: listQuotes(customer) })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '读取报价单失败: ' + e.message })
  }
})

router.get('/download', (req, res) => {
  try {
    const customer = String(req.query.customer || '').trim()
    const name = path.basename(String(req.query.name || '').trim())
    if (!customer || !name) return res.status(400).json({ code: 1, msg: '参数不合法' })
    const abs = path.join(quoteDir(customer), name)
    if (!fs.existsSync(abs)) return res.status(404).json({ code: 1, msg: '文件不存在' })
    if (req.query.inline === '1') res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`)
    else res.download(abs, name)
  } catch (e) {
    res.status(500).json({ code: 1, msg: e.message })
  }
})

router.post('/copy', async (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const name = path.basename(String(req.body?.name || '').trim())
    const abs = path.join(quoteDir(customer), name)
    if (!fs.existsSync(abs)) return res.status(404).json({ code: 1, msg: '文件不存在' })
    await copyFileToClipboard(abs)
    res.json({ code: 0, data: { name } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '复制失败: ' + e.message })
  }
})

router.post('/delete', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const name = path.basename(String(req.body?.name || '').trim())
    if (!customer || !/\.(docx|pdf)$/i.test(name)) return res.status(400).json({ code: 1, msg: '文件名不合法' })
    const dir = quoteDir(customer)
    const stem = path.basename(name, path.extname(name))
    const deleted = []
    for (const ext of ['.docx', '.pdf']) {
      const abs = path.join(dir, stem + ext)
      if (!fs.existsSync(abs)) continue
      try { fs.unlinkSync(abs); deleted.push(path.basename(abs)) } catch {}
    }
    if (!deleted.length) return res.status(404).json({ code: 1, msg: '文件不存在' })
    res.json({ code: 0, data: { deleted } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '删除失败: ' + e.message })
  }
})

export default router
