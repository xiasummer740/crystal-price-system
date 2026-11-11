import { Router } from 'express'
import { queryAll, queryOne, execute } from '../db.js'

const router = Router()

// 某客户的抬头列表（默认抬头排前）
router.get('/', (req, res) => {
  const customer = String(req.query.customer || '').trim()
  if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })
  const rows = queryAll(
    'SELECT * FROM customer_titles WHERE customer = ? ORDER BY is_default DESC, id ASC',
    [customer]
  )
  res.json({ code: 0, data: rows })
})

// 新增抬头
router.post('/', (req, res) => {
  try {
    const b = req.body || {}
    const customer = String(b.customer || '').trim()
    const title = String(b.title || '').trim()
    if (!customer || !title) return res.status(400).json({ code: 1, msg: '客户和抬头名称不能为空' })
    if (b.is_default) execute('UPDATE customer_titles SET is_default = 0 WHERE customer = ?', [customer])
    const r = execute(
      `INSERT INTO customer_titles (customer, title, tax_no, address, phone, contact, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customer, title, b.tax_no || '', b.address || '', b.phone || '', b.contact || '', b.is_default ? 1 : 0]
    )
    res.json({ code: 0, data: { id: r.lastInsertRowid } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '新增抬头失败: ' + e.message })
  }
})

// 编辑抬头
router.put('/:id', (req, res) => {
  try {
    const id = Number(req.params.id)
    const old = queryOne('SELECT * FROM customer_titles WHERE id = ?', [id])
    if (!old) return res.status(404).json({ code: 1, msg: '抬头不存在' })
    const b = req.body || {}
    if (b.is_default) execute('UPDATE customer_titles SET is_default = 0 WHERE customer = ?', [old.customer])
    execute(
      `UPDATE customer_titles SET title=?, tax_no=?, address=?, phone=?, contact=?, is_default=? WHERE id=?`,
      [
        b.title ?? old.title,
        b.tax_no ?? old.tax_no,
        b.address ?? old.address,
        b.phone ?? old.phone,
        b.contact ?? old.contact,
        b.is_default !== undefined ? (b.is_default ? 1 : 0) : old.is_default,
        id
      ]
    )
    res.json({ code: 0 })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '保存抬头失败: ' + e.message })
  }
})

router.delete('/:id', (req, res) => {
  execute('DELETE FROM customer_titles WHERE id = ?', [Number(req.params.id)])
  res.json({ code: 0 })
})

export default router
