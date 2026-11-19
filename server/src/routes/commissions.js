import { Router } from 'express'
import ExcelJS from 'exceljs'
import { queryAll, queryOne, execute } from '../db.js'
import { buildRebateDocx } from '../utils/rebateDoc.js'

const router = Router()

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function calcRow(r, points, defaultTax) {
  const qty = num(r.qty)
  const quote = num(r.quote)
  const tax = r.tax_rate === '' || r.tax_rate === undefined || r.tax_rate === null ? defaultTax : num(r.tax_rate)
  // 下单价格：手工填了就用；没填按「报价 × (1 + 点数%)」自动带，保留 2 位
  let order = r.order_price === '' || r.order_price === undefined || r.order_price === null
    ? Math.round(quote * (1 + num(points) / 100) * 100) / 100
    : num(r.order_price)
  let rebate = r.rebate
  if (rebate === '' || rebate === undefined || rebate === null) {
    // 回扣 = 含税总金额 × 点数% ÷ (1 + 税率)
    rebate = order * qty * num(points) / 100 / (1 + tax / 100)
  }
  return {
    ...r,
    qty,
    quote,
    tax_rate: tax,
    order_price: Math.round(order * 10000) / 10000,
    total_amount: Math.round(order * qty * 100) / 100,
    rebate: Math.round(num(rebate) * 100) / 100
  }
}

function getProfile(customer) {
  const row = queryOne('SELECT * FROM commission_profiles WHERE customer = ?', [customer])
  return row || {
    customer,
    points: 3,
    department: '代理部',
    business: '夏祥',
    bank_name: '深圳农商银行',
    account_name: '张建庭',
    account_no: '6230 3518 8891 2769',
    tax_rate: 13
  }
}

// 客户佣金配置
router.get('/profile', (req, res) => {
  const customer = String(req.query.customer || '').trim()
  if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })
  res.json({ code: 0, data: getProfile(customer) })
})

router.put('/profile', (req, res) => {
  try {
    const b = req.body || {}
    const customer = String(b.customer || '').trim()
    if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })
    execute(
      `INSERT INTO commission_profiles (customer, points, department, business, bank_name, account_name, account_no, tax_rate, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(customer) DO UPDATE SET points=excluded.points, department=excluded.department,
         business=excluded.business, bank_name=excluded.bank_name, account_name=excluded.account_name,
         account_no=excluded.account_no, tax_rate=excluded.tax_rate, updated_at=datetime('now','localtime')`,
      [customer, num(b.points), b.department || '代理部', b.business || '夏祥', b.bank_name || '', b.account_name || '', b.account_no || '', num(b.tax_rate) || 13]
    )
    res.json({ code: 0, data: getProfile(customer) })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '保存佣金设置失败: ' + e.message })
  }
})

// 佣金单列表
router.get('/sheets', (req, res) => {
  const customer = String(req.query.customer || '').trim()
  const rows = customer
    ? queryAll('SELECT * FROM commission_sheets WHERE customer = ? ORDER BY id DESC', [customer])
    : queryAll('SELECT * FROM commission_sheets ORDER BY id DESC LIMIT 200')
  res.json({ code: 0, data: rows.map(r => ({ ...r, rows: JSON.parse(r.rows_json || '[]') })) })
})

router.get('/sheets/:id', (req, res) => {
  const row = queryOne('SELECT * FROM commission_sheets WHERE id = ?', [Number(req.params.id)])
  if (!row) return res.status(404).json({ code: 1, msg: '佣金单不存在' })
  res.json({ code: 0, data: { ...row, rows: JSON.parse(row.rows_json || '[]') } })
})

// 新建/保存佣金单
router.post('/sheets', (req, res) => {
  try {
    const b = req.body || {}
    const customer = String(b.customer || '').trim()
    if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })
    const points = num(b.points)
    const defaultTax = num(b.tax_rate) || 13
    const rows = (Array.isArray(b.rows) ? b.rows : []).map(r => calcRow(r, points, defaultTax))
    const totalQty = rows.reduce((s, r) => s + r.qty, 0)
    const totalRebate = Math.round(rows.reduce((s, r) => s + r.rebate, 0) * 100) / 100
    const payload = [
      customer,
      String(b.period_start || ''),
      String(b.period_end || ''),
      points,
      defaultTax,
      JSON.stringify(rows),
      totalQty,
      totalRebate,
      b.status || '草稿'
    ]
    if (b.id) {
      execute(
        `UPDATE commission_sheets SET customer=?, period_start=?, period_end=?, points=?, tax_rate=?, rows_json=?, total_qty=?, total_rebate=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [...payload, Number(b.id)]
      )
      res.json({ code: 0, data: { id: Number(b.id) } })
    } else {
      const r = execute(
        `INSERT INTO commission_sheets (customer, period_start, period_end, points, tax_rate, rows_json, total_qty, total_rebate, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        payload
      )
      res.json({ code: 0, data: { id: r.lastInsertRowid } })
    }
  } catch (e) {
    res.status(500).json({ code: 1, msg: '保存佣金单失败: ' + e.message })
  }
})

router.delete('/sheets/:id', (req, res) => {
  execute('DELETE FROM commission_sheets WHERE id = ?', [Number(req.params.id)])
  res.json({ code: 0 })
})

// 导出 Excel（打印友好）
router.get('/sheets/:id/xlsx', async (req, res) => {
  try {
    const row = queryOne('SELECT * FROM commission_sheets WHERE id = ?', [Number(req.params.id)])
    if (!row) return res.status(404).json({ code: 1, msg: '佣金单不存在' })
    const rows = JSON.parse(row.rows_json || '[]')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('佣金明细')
    ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
    ws.columns = [
      { key: 'name', width: 34 },
      { key: 'qty', width: 10 },
      { key: 'order_price', width: 12 },
      { key: 'quote', width: 12 },
      { key: 'tax_rate', width: 10 },
      { key: 'total_amount', width: 14 },
      { key: 'rebate', width: 12 },
      { key: 'remark', width: 16 }
    ]
    const title = `${row.customer} 佣金明细`
    const period = [row.period_start, row.period_end].filter(Boolean).join(' ~ ')
    ws.mergeCells('A1:H1')
    ws.getCell('A1').value = title
    ws.getCell('A1').font = { name: '微软雅黑', size: 16, bold: true }
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 30
    ws.mergeCells('A2:H2')
    ws.getCell('A2').value = `统计期间：${period || '-'}    点数：${row.points}%    税率：${row.tax_rate}%    制表日期：${new Date().toLocaleDateString('zh-CN')}`
    ws.getCell('A2').font = { name: '微软雅黑', size: 10, color: { argb: 'FF667085' } }
    ws.getCell('A2').alignment = { horizontal: 'center' }
    const header = ['名称', '数量', '下单价格', '报价', '税率', '含税总金额', '回扣', '备注']
    const hr = ws.getRow(3)
    header.forEach((h, i) => {
      const c = hr.getCell(i + 1)
      c.value = h
      c.font = { name: '微软雅黑', size: 10, bold: true }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } }
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    })
    hr.height = 22
    rows.forEach((r, idx) => {
      const row = ws.getRow(4 + idx)
      row.getCell(1).value = r.name || ''
      row.getCell(2).value = r.qty
      row.getCell(3).value = r.order_price
      row.getCell(4).value = r.quote
      row.getCell(5).value = `${r.tax_rate}%`
      row.getCell(6).value = r.total_amount ?? Math.round(num(r.order_price) * num(r.qty) * 100) / 100
      row.getCell(7).value = r.rebate
      row.getCell(8).value = r.remark || ''
      row.eachCell((c, col) => {
        c.font = { name: '微软雅黑', size: 10 }
        c.alignment = { horizontal: col === 1 || col === 8 ? 'left' : 'center', vertical: 'middle', wrapText: col === 1 }
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        if (col === 3 || col === 4) c.numFmt = '0.0000'
        if (col === 6 || col === 7) c.numFmt = '#,##0.00'
        if (col === 2) c.numFmt = '#,##0'
      })
    })
    const sumRow = ws.getRow(4 + rows.length)
    sumRow.getCell(1).value = '合计'
    sumRow.getCell(2).value = rows.reduce((s, r) => s + num(r.qty), 0)
    sumRow.getCell(6).value = rows.reduce((s, r) => s + num(r.total_amount ?? num(r.order_price) * num(r.qty)), 0)
    sumRow.getCell(7).value = rows.reduce((s, r) => s + num(r.rebate), 0)
    sumRow.eachCell((c, col) => {
      c.font = { name: '微软雅黑', size: 10, bold: true }
      c.alignment = { horizontal: col === 1 ? 'left' : 'center' }
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      if (col === 2) c.numFmt = '#,##0'
      if (col === 6 || col === 7) c.numFmt = '#,##0.00'
    })
    ws.getColumn(1).alignment = { wrapText: true, vertical: 'middle' }
    const buf = await wb.xlsx.writeBuffer()
    const fileName = `佣金明细-${row.customer}-${period || '未填期间'}.xlsx`.replace(/[\\/:*?"<>|]/g, '_')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    res.send(Buffer.from(buf))
  } catch (e) {
    res.status(500).json({ code: 1, msg: '导出 Excel 失败: ' + e.message })
  }
})

// 生成回扣备案表（Word，模板版式）
router.get('/sheets/:id/docx', async (req, res) => {
  try {
    const row = queryOne('SELECT * FROM commission_sheets WHERE id = ?', [Number(req.params.id)])
    if (!row) return res.status(404).json({ code: 1, msg: '佣金单不存在' })
    const rows = JSON.parse(row.rows_json || '[]')
    const prof = getProfile(row.customer)
    const now = new Date()
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const data = {
      customer: row.customer,
      date: localDate,
      department: prof.department || '代理部',
      business: prof.business || '夏祥',
      bank_name: prof.bank_name || '',
      account_name: prof.account_name || '',
      account_no: prof.account_no || '',
      rows: rows.map(r => {
        const unit = Math.round(num(r.quote) * num(row.points) / 100 * 10000) / 10000
        return {
          name: r.name || '',
          taxable: true,
          quote: num(r.quote),
          order_price: num(r.order_price),
          method: `${unit}/1.13`,
          remark: `${Number(row.points)}个点${r.remark ? '；' + r.remark : ''}`
        }
      })
    }
    const out = await buildRebateDocx(data)
    const fileName = `${row.customer}-回扣备案-${out.date}.docx`.replace(/[\\/:*?"<>|]/g, '_')
    res.download(out.docxPath, fileName)
  } catch (e) {
    res.status(500).json({ code: 1, msg: '生成备案表失败: ' + e.message })
  }
})

export default router
