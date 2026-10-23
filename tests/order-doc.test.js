import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import ExcelJS from 'exceljs'
import { buildOrderXlsx } from '../server/src/utils/orderDoc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEAL = fs.readFileSync(path.join(__dirname, '..', 'server', 'assets', 'seal-jkx.png'))
const LOGO = fs.readFileSync(path.join(__dirname, '..', 'server', 'assets', 'sjk-logo.png'))
const ASSETS = { seal: { buffer: SEAL, extension: 'png' }, logo: { buffer: LOGO, extension: 'png' } }

function baseOrder(items) {
  return {
    orderNo: 'GR261022001',
    signDate: '2026-10-22',
    supplier: {
      name: '深圳市晶科鑫实业有限公司',
      address: '深圳市龙岗区坂田街道雪岗路2018号天安云谷产业园一期3栋C座12楼1204-1206室',
      contact: '夏祥',
      phone: '19168958953',
      email: 'sales034@q-crystal.com'
    },
    buyer: {
      name: '深圳市靖邦电子有限公司',
      address: '深圳市光明区玉塘街道红星社区第三工业区星湖路35号3楼厂房',
      contact: '王小姐',
      phone: '',
      fax: ''
    },
    items,
    terms: { deliveryPlace: '快 递', freight: '由甲方承担', acceptance: '收到货15天内', settlement: '现金' },
    sign: { supplierRep: '夏祥' }
  }
}

const twoItems = [
  { code: 'X01 S000658', spec: '3N48000G33YC/晶科鑫\nXTAL OSC 48MHZ CMOS 1.8-3.3V SMD3225-4P', qty: 1000, price: 1.85, deliveryDate: '2026/10/29', remark: '' },
  { code: '9008006710', spec: 'SJK-7K32768K0135GRC9/TAIJING\n1610,32.768KHz,9pF,±20PPM,90KΩ,-40~+85C', qty: 5000, price: 0.82, deliveryDate: '2026/10/29', remark: '编带' }
]

describe('订单 Excel 生成', () => {
  it('生成的是合法 xlsx，头部/明细/合计/签章都在位', async () => {
    const buf = await buildOrderXlsx(baseOrder(twoItems), ASSETS)
    assert.ok(buf.length > 10000, '文件不能是空壳')

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]

    assert.match(String(ws.getCell('A1').value), /供 货 合 同/)
    assert.match(String(ws.getCell('A3').value), /深圳市晶科鑫实业有限公司/)
    assert.match(String(ws.getCell('D3').value), /GR261022001/)
    assert.match(String(ws.getCell('D4').value), /深圳市靖邦电子有限公司/)

    // 明细行：第 12、13 行；合计在第 14 行（行数随物料条数顺延）
    assert.equal(ws.getCell('A12').value, 'X01 S000658')
    assert.equal(ws.getCell('C12').value, 1000)
    assert.equal(ws.getCell('D13').value, 0.82)
    assert.equal(ws.getCell('A14').value, '合计金额(RMB)')
    // 合计金额：公式 + 缓存结果（不重算也能显示）
    assert.equal(ws.getCell('E14').value.formula, 'SUM(E12:E13)')
    assert.equal(ws.getCell('E14').value.result, 5950)

    // 条款与签章跟着顺延：2 条物料时签章在第 26 行
    assert.match(String(ws.getCell('A26').value), /供方签章：深圳市晶科鑫实业有限公司/)
    assert.equal(ws.getCell('D26').value, '需方签章：')
    assert.match(String(ws.getCell('A28').value), /签约时间：2026\/10\/22/)

    // 合并区域（标题、合计、签章代表等）
    const merges = ws.model.merges || []
    for (const ref of ['A1:G1', 'A14:D14', 'E14:G14', 'A27:B27']) {
      assert.ok(merges.includes(ref), `缺少合并区域 ${ref}`)
    }
  })

  it('公章 + 左上角 logo 都写进 media，位置正确', async () => {
    const buf = await buildOrderXlsx(baseOrder(twoItems), ASSETS)
    const zip = new AdmZip(buf)
    const media = zip.getEntries().filter(e => !e.isDirectory && e.entryName.startsWith('xl/media/'))
    assert.equal(media.length, 2, '应当有公章 + logo 两张图')
    assert.ok(media.every(m => m.header.size > 5000), '图片不能是空文件')

    const drawing = zip.readAsText('xl/drawings/drawing1.xml')
    assert.match(drawing, /<xdr:oneCellAnchor|<xdr:twoCellAnchor/)
    // logo：A1 左上角，右移 38100 EMU、下移 19050 EMU，230×143 px = 2190750×1362075 EMU
    assert.match(drawing, /<xdr:row>0<\/xdr:row>/)
    assert.match(drawing, /<xdr:colOff>38100<\/xdr:colOff>/)
    assert.match(drawing, /cx="2190750" cy="1362075"/)
    // 公章：锚在「供方签章」行（2 条物料时 0 基 25），B 列右移 52705、行内下移 247650
    assert.match(drawing, /<xdr:row>25<\/xdr:row>/)
    assert.match(drawing, /<xdr:colOff>52705<\/xdr:colOff>/)
    assert.match(drawing, /<xdr:rowOff>247650<\/xdr:rowOff>/)
    assert.match(drawing, /cx="1333500" cy="1333500"/)
  })

  it('showSeal=false 且 showLogo=false 时没有图片', async () => {
    const order = baseOrder(twoItems)
    order.showSeal = false
    order.showLogo = false
    const buf = await buildOrderXlsx(order, ASSETS)
    const zip = new AdmZip(buf)
    assert.equal(zip.getEntries().filter(e => !e.isDirectory && e.entryName.startsWith('xl/media/')).length, 0)
  })

  it('物料条数增加时，条款/签章整体下移且合计公式跟着扩', async () => {
    const many = [...twoItems, { code: 'C3', spec: 'CUSTOM\n3225,4pin,24.000MHz', qty: 2, price: 1, deliveryDate: '2026/10/30', remark: '' }]
    const buf = await buildOrderXlsx(baseOrder(many), ASSETS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    assert.equal(ws.getCell('A15').value, '合计金额(RMB)')
    assert.equal(ws.getCell('E15').value.formula, 'SUM(E12:E14)')
    assert.match(String(ws.getCell('A27').value), /供方签章/)
  })

  it('长规格自动撑高行，不被裁字', async () => {
    const long = [{
      code: 'X1',
      spec: 'SJK-7U12000M3125GRC9\n3225,4pin,12.000MHz,18pF,±10ppm,55Ω,-20~+70℃±10ppm同时满足-40~+85℃±30ppm,汽车规格,印字:SJK/12.000',
      qty: 1, price: 0.23, deliveryDate: '2026/10/29', remark: ''
    }]
    const buf = await buildOrderXlsx(baseOrder(long), ASSETS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    assert.ok(ws.getRow(12).height >= 60, `长规格行应被撑高，实际 ${ws.getRow(12).height}`)
  })

  it('货品编码没填时默认按行号 1、2、3…', async () => {
    const items = twoItems.map(it => ({ ...it, code: '' }))
    const buf = await buildOrderXlsx(baseOrder(items), ASSETS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    assert.equal(ws.getCell('A12').value, 1)
    assert.equal(ws.getCell('A13').value, 2)
  })

  it('填了自定义货品编码就用填的', async () => {
    const buf = await buildOrderXlsx(baseOrder(twoItems), ASSETS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    assert.equal(wb.worksheets[0].getCell('A12').value, 'X01 S000658')
  })

  it('价格口径可切换：金额表头 含税 / 未税', async () => {
    const taxIn = await buildOrderXlsx(baseOrder(twoItems), ASSETS)
    const wb1 = new ExcelJS.Workbook()
    await wb1.xlsx.load(taxIn)
    assert.equal(wb1.worksheets[0].getCell('E11').value, '金额（含税)')

    const order = baseOrder(twoItems)
    order.priceMode = '未税'
    const taxOut = await buildOrderXlsx(order, ASSETS)
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(taxOut)
    assert.equal(wb2.worksheets[0].getCell('E11').value, '金额（未税)')
  })

  it('交货时间可以是空 / 2周 / 2-3周 这类自由文本', async () => {
    const items = [
      { ...twoItems[0], deliveryDate: '' },
      { ...twoItems[1], deliveryDate: '2-3周' }
    ]
    const buf = await buildOrderXlsx(baseOrder(items), ASSETS)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    assert.ok(!ws.getCell('F12').value, '留空就是空单元格')
    assert.equal(ws.getCell('F13').value, '2-3周')
  })

  it('没有任何物料时拒绝生成', async () => {
    await assert.rejects(() => buildOrderXlsx(baseOrder([]), null), /至少需要一条物料/)
  })
})
