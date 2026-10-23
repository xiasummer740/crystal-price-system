/**
 * 供货合同（订单）Excel 生成 —— 版式对齐祥哥给的样张
 *
 * 样张：`靖邦-晶科鑫订单JB260310001.xls`（Sheet1）
 *   - A4 纵向、缩放 93%，7 列（A~G），标题「供 货 合 同」黑体 36 加粗
 *   - 第 3~8 行：甲方（我方）信息 / 单号 + 乙方（客户）信息
 *   - 第 10~13 行：产品明细表（货品编码 / 产品规格 / 数量 / 单价 / 金额 / 交货时间 / 备注）
 *   - 第 14~23 行：二~十 条款；第 25~27 行：双方签章
 *   - 公章（公司公章，透明 PNG）压在「供方签章」上一点
 *
 * 与样张的唯一结构性差异：**物料行数可动态增减**。
 * 样张只有 1 行物料，这里按条目数顺延下面的条款/签章行，并同步移动公章锚点。
 *
 * 生成用 ExcelJS（而不是 SheetJS）：只有它能把公章图片写进 xlsx。
 */
import ExcelJS from 'exceljs'
import AdmZip from 'adm-zip'

const FONT = '黑体'
const THIN = { style: 'thin', color: { argb: 'FF000000' } }
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN }

// 列宽：与样张完全一致（Excel 字符宽）
// Excel 的列宽 → 点数是固定 6pt/字符（96dpi 下 8px），与「常规」字体无关，所以照抄样张即可。
const COL_WIDTHS = [14.25, 26.375, 10.5, 12.375, 15.5, 11.625, 10.25]

// 公章显示尺寸：140×140 px（祥哥在示例文件里用的就是这么大）
const SEAL_W = 140
const SEAL_H = 140
// 锚点：B 列右移 52705 EMU、从「供方签章」行下移 247650 EMU —— 这是祥哥 2026-10-22
// 在示例文件里手工调好的位置：公章压在签章文字上一点（真实盖章就是这样），
// 透明底不会把文字整段盖掉。xdr:colOff / xdr:rowOff 单位是 EMU（1px = 9525 EMU）
const SEAL_OFF_X = 52705
const SEAL_OFF_Y = 247650

// 左上角 SJK logo（祥哥 2026-10-22）：251×156 等比缩到 100×62 px，
// 放在 A1 里、右移 4px / 下移 2px —— 正好在标题「供 货 合 同」左边，不压字。
const LOGO_W = 230
const LOGO_H = 143
const LOGO_OFF_X = 38100   // 4px = 38100 EMU
const LOGO_OFF_Y = 19050   // 2px = 19050 EMU

// —— 样张固定条款（二、三、四、五、十）；六~九 的值可由界面改 ——
const FIXED_CLAUSES = {
  qualityHead: '二、质量要求、技术标准：',
  quality: '    甲方按国家同类产品质量技术标准，保证产品质量；若有次品或不足量，甲方100%补足。',
  third: '三、甲方按乙方订单要求,向乙方供应所需晶体,非甲方出现质量问题,乙方不能单方自行退货或暂停提货。',
  fourth: '四、价格经双方协商后确认，双方均无权单方面更改价格。',
  fifth: '五、乙方产品出现问题，甲方有义务协助调查并解决。',
  tenth: '十、违约责任：双方协商，并遵照《中华人民共和国合同法》及相关法律法规。'
}

/** 文本在给定列宽（Excel 字符宽）下大约占几行 —— 用于把行高撑到不裁字 */
function countLines(text, widthUnits) {
  const s = String(text ?? '')
  if (!s) return 1
  // 可用宽度按 85% 估：Excel 实际换行比「字符数」更保守（±、Ω、℃、数字都偏宽），
  // 估太满会出现「行高不够、文字被上下裁掉」——宁可多留半行
  const usable = Math.max(4, widthUnits * 0.85)
  let lines = 0
  for (const seg of s.split('\n')) {
    let units = 0
    let segLines = 1
    for (const ch of seg) {
      // 中日韩全角字符按 2 个字符宽估算，其余按 1
      const w = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 2 : 1
      if (units + w > usable) { segLines++; units = w } else { units += w }
    }
    lines += segLines
  }
  return Math.max(1, lines)
}

function lineHeightPx(lines, minHeight) {
  // 12pt 黑体实测行距 ~14.6pt；只留 2pt 余量（祥哥 2026-10-23：行高别再浪费，能一页就一页）
  return Math.max(minHeight, lines * 14.6 + 2)
}

function makeCell(ws, r, c, value, opt = {}) {
  const cell = ws.getCell(r, c)
  if (value !== undefined) cell.value = value
  const font = { name: FONT, size: opt.size ?? 12, bold: !!opt.bold }
  if (opt.color) font.color = { argb: opt.color }
  cell.font = font
  cell.alignment = {
    horizontal: opt.h ?? 'left',
    // ⚠️ ExcelJS 的垂直居中枚举是 'middle'（'center' 会被静默丢弃，文字掉到单元格底部）
    vertical: 'middle',
    wrapText: !!opt.wrap
  }
  if (opt.border) cell.border = BORDER_ALL
  if (opt.numFmt) cell.numFmt = opt.numFmt
  return cell
}

/**
 * 合并单元格并**保住左上角单元格的样式**。
 *
 * ⚠️ 踩过的坑：ExcelJS 合并后，区域内其它单元格会代理到左上角 —— 合并之后再给
 * B4/C4 设样式，实际是把左上角的 wrapText 覆盖成默认值，长地址就变成一行截断。
 * 所以必须**先**把整块区域按左上角样式铺好，**最后**再 merge。
 */
function merge(ws, r1, c1, r2, c2, opt = {}) {
  const master = ws.getCell(r1, c1)
  const style = {
    size: master.font?.size,
    bold: master.font?.bold,
    color: master.font?.color?.argb,
    h: master.alignment?.horizontal,
    wrap: master.alignment?.wrapText,
    border: !!master.border?.top?.style,
    numFmt: master.numFmt,
    ...opt
  }
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      if (r === r1 && c === c1) continue
      makeCell(ws, r, c, undefined, style)
    }
  }
  ws.mergeCells(r1, c1, r2, c2)
}

const money = n => Math.round((Number(n) || 0) * 100) / 100

/**
 * 把 ExcelJS 的「常规」字体从 Calibri 11 改成样张的 黑体 12。
 *
 * 为什么非改不可：Excel 的列宽单位是「常规字体字符数」，Calibri 11（7px/字符）与
 * 黑体 12（8px/字符）算出来的实际宽度差 1/8 —— 打印出来整张表会窄一截、右边界对不上样张。
 * ExcelJS 没有公开「默认字体」的写入口，所以在生成的 xlsx 上做一次定点替换。
 */
function patchDefaultFont(buf) {
  const zip = new AdmZip(buf)
  let changed = false

  const stylesPath = 'xl/styles.xml'
  let styles = zip.readAsText(stylesPath)
  const i = styles.indexOf('<font>')
  const j = styles.indexOf('</font>', i)
  if (i >= 0 && j > i) {
    const first = styles.slice(i, j + 7)
    if (first.includes('Calibri')) {
      styles = styles.slice(0, i) +
        '<font><sz val="12"/><name val="黑体"/><charset val="134"/><family val="2"/></font>' +
        styles.slice(j + 7)
      zip.updateFile(stylesPath, Buffer.from(styles, 'utf8'))
      changed = true
    }
  }

  const sheetPath = 'xl/worksheets/sheet1.xml'
  let sheet = zip.readAsText(sheetPath)
  if (sheet.includes('defaultRowHeight="15"')) {
    sheet = sheet.replace('defaultRowHeight="15"', 'defaultRowHeight="14.25"')
    zip.updateFile(sheetPath, Buffer.from(sheet, 'utf8'))
    changed = true
  }

  return changed ? zip.toBuffer() : buf
}

/**
 * 生成订单工作簿
 *
 * @param {object} order
 *   orderNo      单号（如 JB261022001）
 *   signDate     签约日期 YYYY-MM-DD
 *   supplier     { name, address, contact, phone, email }
 *   buyer        { name, address, contact, phone, fax }
 *   items        [{ code, spec, qty, price, deliveryDate, remark }]
 *   terms        { deliveryPlace, freight, acceptance, settlement }
 *   sign         { supplierRep }
 *   priceMode    '含税' | '未税'（表头显示「金额（含税)」/「金额（未税)」）
 *   showSeal     是否贴公章
 *   showLogo     是否贴左上角 SJK logo（默认贴）
 * @param {{ seal?: {buffer:Buffer,extension:string}|null, logo?: {buffer:Buffer,extension:string}|null }} assets
 * @returns {Promise<Buffer>} xlsx 二进制
 */
export async function buildOrderXlsx(order, assets = {}) {
  assets = assets || {}
  const seal = assets.seal || null
  const logo = assets.logo || null

  const items = (order.items || []).filter(i => i && (
    String(i.spec || '').trim() !== '' || String(i.code || '').trim() !== ''
  ))
  if (!items.length) throw new Error('订单至少需要一条物料')

  const wb = new ExcelJS.Workbook()
  wb.creator = '晶振报价管理系统'
  wb.created = new Date()
  const ws = wb.addWorksheet('供货合同', {
    pageSetup: {
      paperSize: 9,                 // A4
      orientation: 'portrait',
      scale: 93,
      // ExcelJS 默认写 fitToWidth/fitToHeight=1，会让 Excel 走「缩放到一页」而忽略 scale，
      // 打印宽度会变成 ~98%。样张是固定 93%，这里必须清掉。
      fitToPage: false,
      fitToWidth: undefined,
      fitToHeight: undefined,
      horizontalCentered: false,
      margins: {
        left: 0.15748031496062992,
        right: 0,
        top: 0.5905511811023623,
        bottom: 0.5905511811023623,
        header: 0.5118110236220472,
        footer: 0.5118110236220472
      }
    }
  })
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const supplier = order.supplier || {}
  const buyer = order.buyer || {}
  const terms = order.terms || {}
  const dateText = String(order.signDate || '').replace(/-/g, '/')

  // ===== 标题 =====
  // 行高按 230×143 的 logo 留足（107pt），标题在同一条带子里垂直居中
  ws.getRow(1).height = 110
  makeCell(ws, 1, 1, '供 货 合 同', { size: 36, bold: true, h: 'center' })
  merge(ws, 1, 1, 1, 7, { size: 36, bold: true, h: 'center' })

  // ===== 甲乙双方信息（第 3~8 行）=====
  // 2026-10-23 祥哥要求压缩行高：这些空行/单行都收到刚好放得下
  ws.getRow(2).height = 10
  ws.getRow(3).height = 13
  ws.getRow(4).height = lineHeightPx(countLines(supplier.address, COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2]), 26)
  ws.getRow(5).height = lineHeightPx(countLines(buyer.address, COL_WIDTHS[3] + COL_WIDTHS[4] + COL_WIDTHS[5] + COL_WIDTHS[6]), 30)
  ws.getRow(6).height = 13
  ws.getRow(7).height = 14
  ws.getRow(8).height = 13
  ws.getRow(9).height = 13

  makeCell(ws, 3, 1, `甲  方：${supplier.name || ''}`, { h: 'left' })
  merge(ws, 3, 1, 3, 3)
  makeCell(ws, 3, 4, `     单  号：${order.orderNo || ''}`, { h: 'left' })
  merge(ws, 3, 4, 3, 7)

  makeCell(ws, 4, 1, `地  址：${supplier.address || ''}`, { h: 'left', wrap: true })
  merge(ws, 4, 1, 4, 3)
  makeCell(ws, 4, 4, `     乙  方：${buyer.name || ''}`, { h: 'left', wrap: true })
  merge(ws, 4, 4, 4, 7)

  makeCell(ws, 5, 1, '', { h: 'left' })
  merge(ws, 5, 1, 5, 3)
  makeCell(ws, 5, 4, `     地  址：${buyer.address || ''}`, { h: 'left', wrap: true })
  merge(ws, 5, 4, 5, 7)

  makeCell(ws, 6, 1, `联系人：${supplier.contact || ''}`, { h: 'left' })
  merge(ws, 6, 1, 6, 2)
  makeCell(ws, 6, 4, `     联系人：${buyer.contact || ''}`, { h: 'left' })
  merge(ws, 6, 4, 6, 7)

  makeCell(ws, 7, 1, `电  话：${supplier.phone || ''}`, { h: 'left' })
  merge(ws, 7, 1, 7, 2)
  makeCell(ws, 7, 4, `     电  话：${buyer.phone || ''}`, { h: 'left', wrap: true })
  merge(ws, 7, 4, 7, 7)

  makeCell(ws, 8, 1, `邮箱：${supplier.email || ''}`, { h: 'left' })
  merge(ws, 8, 1, 8, 2)
  makeCell(ws, 8, 4, `     传  真：${buyer.fax || ''}`, { h: 'left' })
  merge(ws, 8, 4, 8, 7)

  // ===== 明细表 =====
  ws.getRow(10).height = 13
  makeCell(ws, 10, 1, '一、产品规格、数量、价格、金额、交货时间', { h: 'left' })
  merge(ws, 10, 1, 10, 7)

  ws.getRow(11).height = 42
  // 价格口径：含税 / 未税（祥哥 2026-10-22）——只改表头，金额仍是 数量×单价，不做换算
  const amountHead = order.priceMode === '未税' ? '金额（未税)' : '金额（含税)'
  const headers = ['货品编码', '产品规格', '数量(PCS)', '单价', amountHead, '交货时间', '备注']
  headers.forEach((h, i) => makeCell(ws, 11, i + 1, h, { bold: true, h: 'center', border: true, wrap: i === 4 }))

  const firstItemRow = 12
  let total = 0
  items.forEach((it, idx) => {
    const r = firstItemRow + idx
    const qty = Number(it.qty) || 0
    const price = Number(it.price) || 0
    const amount = money(qty * price)
    total += amount

    const specText = String(it.spec || '')
    ws.getRow(r).height = lineHeightPx(Math.max(
      countLines(specText, COL_WIDTHS[1]),
      countLines(it.code, COL_WIDTHS[0])
    ), 30)

    // 货品编码：默认按行号 1、2、3…（祥哥习惯），填了自定义编码就用填的。
    // 纯行号写成数字（和祥哥示例文件一致，避免 Excel 报「数字存成文本」的绿三角）
    const codeText = String(it.code ?? '').trim()
    const autoCode = idx + 1
    const codeVal = !codeText ? autoCode : (codeText === String(autoCode) ? autoCode : codeText)
    makeCell(ws, r, 1, codeVal, { h: 'center', border: true, wrap: true })
    makeCell(ws, r, 2, specText, { h: 'center', border: true, wrap: true })
    makeCell(ws, r, 3, qty, { h: 'center', border: true, numFmt: '#,##0' })
    makeCell(ws, r, 4, price, { h: 'center', border: true })
    makeCell(ws, r, 5, { formula: `C${r}*D${r}`, result: amount }, { h: 'center', border: true, numFmt: '#,##0.00' })
    makeCell(ws, r, 6, it.deliveryDate || '', { h: 'center', border: true })
    makeCell(ws, r, 7, it.remark || '', { h: 'center', border: true, wrap: true })
  })

  const totalRow = firstItemRow + items.length
  ws.getRow(totalRow).height = 22
  makeCell(ws, totalRow, 1, '合计金额(RMB)', { size: 14, bold: true, h: 'center', border: true })
  merge(ws, totalRow, 1, totalRow, 4, { size: 14, bold: true, h: 'center', border: true })
  for (let c = 5; c <= 7; c++) makeCell(ws, totalRow, c, undefined, { border: true })
  makeCell(ws, totalRow, 5, {
    formula: `SUM(E${firstItemRow}:E${totalRow - 1})`,
    result: money(total)
  }, { size: 14, bold: true, h: 'center', border: true, numFmt: '#,##0.00' })
  merge(ws, totalRow, 5, totalRow, 7, { size: 14, bold: true, h: 'center', border: true })

  // ===== 条款（二~十）=====
  const r2 = totalRow + 1
  const heights = [16, 16, 19.5, 16, 16, 16, 16, 16, 16, 16]
  for (let i = 0; i < heights.length; i++) ws.getRow(r2 + i).height = heights[i]

  const clauses = [
    FIXED_CLAUSES.qualityHead,
    FIXED_CLAUSES.quality,
    FIXED_CLAUSES.third,
    FIXED_CLAUSES.fourth,
    FIXED_CLAUSES.fifth,
    `六、交货地点、运输方式： ${terms.deliveryPlace ?? '快 递'}`,
    `七、交货运输费用：${terms.freight ?? '由甲方承担'}`,
    `八、验收标准、方法及提出异议期限：${terms.acceptance ?? '收到货15天内'}`,
    `九、结算方式及期限：${terms.settlement ?? '现金'}`,
    FIXED_CLAUSES.tenth
  ]
  clauses.forEach((text, i) => {
    // 样张里「九、结算方式及期限」是红色（提醒账期）
    const color = i === 8 ? 'FFFF0000' : undefined
    makeCell(ws, r2 + i, 1, text, { h: i === 1 || i === 2 ? 'left' : 'left', color })
    merge(ws, r2 + i, 1, r2 + i, 7, { color })
  })

  // ===== 签章（供方/需方）=====
  const blankRow = r2 + 10
  ws.getRow(blankRow).height = 6

  const sigRow = blankRow + 1
  const repRow = sigRow + 1
  const dateRow = sigRow + 2
  for (const r of [sigRow, repRow, dateRow]) ws.getRow(r).height = 45.75

  makeCell(ws, sigRow, 1, `供方签章：${supplier.name || ''}`, { h: 'left' })
  makeCell(ws, sigRow, 4, '需方签章：', { h: 'left' })
  makeCell(ws, repRow, 1, `签约代表：${order.sign?.supplierRep || supplier.contact || ''}`, { h: 'left' })
  merge(ws, repRow, 1, repRow, 2)
  makeCell(ws, repRow, 4, '签约代表：', { h: 'left' })
  makeCell(ws, dateRow, 1, `签约时间：${dateText}`, { h: 'left' })
  merge(ws, dateRow, 1, dateRow, 2)
  makeCell(ws, dateRow, 4, '签约时间：', { h: 'left' })

  // ===== 左上角品牌 logo =====
  if (order.showLogo !== false && logo?.buffer) {
    const logoId = wb.addImage({ buffer: logo.buffer, extension: logo.extension || 'png' })
    ws.addImage(logoId, {
      tl: { nativeCol: 0, nativeRow: 0, nativeColOff: LOGO_OFF_X, nativeRowOff: LOGO_OFF_Y },
      ext: { width: LOGO_W, height: LOGO_H },
      editAs: 'oneCell'
    })
  }

  // ===== 公章 =====
  if (order.showSeal !== false && seal?.buffer) {
    const imageId = wb.addImage({ buffer: seal.buffer, extension: seal.extension || 'jpeg' })
    ws.addImage(imageId, {
      tl: {
        // ⚠️ 必须用 nativeCol/nativeRow 这一组字段：用 col/row 会把 nativeColOff 归零，
        //    偏移白设（公章会贴着单元格左上角，和样张位置对不上）
        // 锚在「供方签章」行（sigRow）往下一点，公章压住一点文字（祥哥要的效果）
        nativeCol: 1,
        nativeRow: sigRow - 1,
        nativeColOff: SEAL_OFF_X,
        nativeRowOff: SEAL_OFF_Y
      },
      ext: { width: SEAL_W, height: SEAL_H },
      editAs: 'oneCell'
    })
  }

  ws.pageSetup.printArea = `A1:G${dateRow}`

  const buf = await wb.xlsx.writeBuffer()
  return patchDefaultFont(Buffer.from(buf))
}
