/**
 * 生成报价单（.docx）—— 以祥哥的模板为底，替换占位符，保真度最高。
 *
 * 模板 `server/assets/quote-template.docx` 是从
 * `D:\夏天\客户资料\晶科鑫报价单2026-5-20后.docx` 预处理来的：
 *   - 头部日期 → {{DATE}}
 *   - TO/FM、ATTN/TEL → 占位符
 *   - 明细表第一行 → 7 个 {{I_*}} 占位符（其余空行已删）
 * logo、公章、字体、列宽、条款都原样保留。
 *
 * 运行时只做字符串替换 + 按物料条数克隆明细行，不引入 docx 依赖。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import AdmZip from 'adm-zip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.join(__dirname, '..', '..', 'assets', 'quote-template.docx')

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 单元格文本：换行转成 Word 的 <w:br/>，保持同一个 run 的格式 */
function cellText(s) {
  return esc(s).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">')
}

const ITEM_ROW_RE = /<w:tr\b[^>]*>(?:(?!<\/w:tr>)[\s\S])*?\{\{I_CUST\}\}(?:(?!<\/w:tr>)[\s\S])*?<\/w:tr>/

/** 估算字符宽度：中文按 2 个西文宽度 */
function units(s) {
  let n = 0
  for (const ch of String(s ?? '')) {
    n += /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 2 : 1
  }
  return n
}

/**
 * 按本单内容分配列宽（twips，总宽固定 10400）：
 * 客户料号/SJK 号/单价/数量/L-T/备注按最长内容给，剩下的全给规格列；
 * 规格长就自动多行换行，不挤别的列。
 */
function computeWidths(items) {
  const TOTAL = 10400
  const maxU = (f) => Math.max(1, ...items.map(it => units(it[f])))
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)))
  const pad = 200
  const w = [0, 0, 0, 0, 0, 0, 0]
  w[0] = clamp(maxU('customer_code') * 135 + pad, 1000, 2000)
  w[1] = clamp(maxU('jkx_code') * 135 + pad, 1500, 3300)
  w[3] = clamp(maxU('price') * 120 + pad, 650, 1000)
  w[4] = clamp(maxU('qty') * 120 + pad, 700, 1300)
  w[5] = clamp(maxU('lt') * 120 + pad, 650, 1100)
  w[6] = clamp(maxU('remark') * 120 + pad, 650, 1700)

  const base = [900, 1500, 650, 700, 650, 650]
  let others = w[0] + w[1] + w[3] + w[4] + w[5] + w[6]
  if (TOTAL - others < 1700) {
    // 其它列太占地方：按比例压到最小，保证规格列至少 1700
    const factor = (TOTAL - 1700) / others
    const idx = [0, 1, 3, 4, 5, 6]
    idx.forEach((ci, k) => { w[ci] = Math.max(base[k], Math.round(w[ci] * factor)) })
    others = w[0] + w[1] + w[3] + w[4] + w[5] + w[6]
  }
  w[2] = TOTAL - others
  return w
}

export function buildQuoteDocx(quote) {
  const zip = new AdmZip(TEMPLATE)
  let xml = zip.readAsText('word/document.xml')

  const header = {
    '{{DATE}}': quote.date || '',
    '{{TO}}': quote.to || '',
    '{{FM}}': quote.fm || '',
    '{{ATTN}}': quote.attn || '',
    '{{TEL}}': quote.tel || '',
    // 条款前三项可由界面改（祥哥 2026-10-28）
    '{{T_SETTLE}}': quote.terms?.settle ?? '款到做货',
    '{{T_LEAD}}': quote.terms?.lead ?? '5-6周',
    '{{T_VALID}}': quote.terms?.valid ?? '本报价单 30 天内有效'
  }
  for (const [k, v] of Object.entries(header)) xml = xml.split(k).join(cellText(v))

  const match = xml.match(ITEM_ROW_RE)
  if (!match) throw new Error('报价单模板缺少明细行占位符（{{I_CUST}}）')
  const tplRow = match[0]

  const items = (quote.items || []).filter(it => it && (String(it.spec || '').trim() || String(it.jkx_code || '').trim()))
  if (!items.length) throw new Error('报价单至少需要一条物料')

  const rows = items.map(it => {
    const vals = {
      '{{I_CUST}}': it.customer_code || '',
      '{{I_SJK}}': it.jkx_code || '',
      '{{I_SPEC}}': it.spec || '',
      '{{I_PRICE}}': it.price === 0 || it.price ? String(it.price) : '',
      '{{I_QTY}}': it.qty || '',
      '{{I_LT}}': it.lt || '',
      '{{I_REMARK}}': it.remark || ''
    }
    let row = tplRow
    for (const [k, v] of Object.entries(vals)) row = row.split(k).join(cellText(v))
    return row
  }).join('')

  xml = xml.replace(ITEM_ROW_RE, rows)

  // 按内容分配列宽
  const widths = computeWidths(items)
  widths.forEach((v, i) => { xml = xml.split(`{{W${i + 1}}}`).join(String(v)) })
  xml = xml.split('{{WT}}').join(String(widths.reduce((a, b) => a + b, 0)))

  zip.updateFile('word/document.xml', Buffer.from(xml, 'utf8'))
  return zip.toBuffer()
}
