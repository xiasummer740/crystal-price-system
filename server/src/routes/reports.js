// 总结汇报 API — 日报/周报/月报
// 按客户分组汇总记事，展示标题、内容摘要和状态

import { Router } from 'express'
import { queryAll } from '../db.js'

const router = Router()

// 计算时间范围
function calcRange(range) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  let start, end
  switch (range) {
    case 'today':
      start = fmt(now) + ' 00:00:00'
      end = fmt(now) + ' 23:59:59'
      break
    case 'week': {
      const day = now.getDay()
      const mon = new Date(now)
      mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      start = fmt(mon) + ' 00:00:00'
      end = fmt(now) + ' 23:59:59'
      break
    }
    case 'last-week': {
      const day = now.getDay()
      const thisMon = new Date(now)
      thisMon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      const lastMon = new Date(thisMon)
      lastMon.setDate(thisMon.getDate() - 7)
      const lastSun = new Date(lastMon)
      lastSun.setDate(lastMon.getDate() + 6)
      start = fmt(lastMon) + ' 00:00:00'
      end = fmt(lastSun) + ' 23:59:59'
      break
    }
    case 'month':
      start = fmt(new Date(now.getFullYear(), now.getMonth(), 1)) + ' 00:00:00'
      end = fmt(now) + ' 23:59:59'
      break
    case 'year':
      start = `${now.getFullYear()}-01-01 00:00:00`
      end = fmt(now) + ' 23:59:59'
      break
    default:
      start = fmt(now) + ' 00:00:00'
      end = fmt(now) + ' 23:59:59'
  }
  return { start, end }
}

// 截取文本摘要
function summary(text, maxLen = 80) {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  return clean.slice(0, maxLen) + '…'
}

// 提取内容要点（只取最新一段，去掉时间戳和分隔符）
function summarizeContent(content) {
  if (!content || !content.trim()) return ''
  let text = content
  // 只取第一个分隔符之前的内容（最新进度）
  const sep = text.indexOf('\n\n---\n\n')
  if (sep > 0) text = text.slice(0, sep)
  // 去掉开头的 📅 时间戳行
  text = text.replace(/^📅\s+\*\*.*?\*\*\n*/u, '')
  const lines = text.split('\n').filter(l => l.trim())
  return lines.slice(0, 20).map(l => summary(l, 300)).join('\n')
}

router.get('/', async (req, res) => {
  try {
    const { range = 'today', start: customStart, end: customEnd } = req.query

    // 时间范围
    let start, end
    if (customStart && customEnd) {
      start = customStart + ' 00:00:00'
      end = customEnd + ' 23:59:59'
    } else {
      ({ start, end } = calcRange(range))
    }

    // 查记事
    const notes = queryAll(`
      SELECT n.*, c.name as category_name, c.color as category_color
      FROM notes n
      LEFT JOIN note_categories c ON n.category_id = c.id AND c.is_deleted = 0
      WHERE n.is_deleted = 0 AND n.updated_at >= ? AND n.updated_at <= ?
      ORDER BY n.customer ASC, n.created_at DESC
    `, [start, end])

    // 统计
    const total = notes.length
    const byStatus = { todo: 0, done: 0 }
    const customerMap = {}

    for (const note of notes) {
      byStatus[note.status] = (byStatus[note.status] || 0) + 1

      const customer = note.customer || '未指定客户'
      if (!customerMap[customer]) {
        customerMap[customer] = { customer, count: 0, done: 0, pending: 0, items: [] }
      }
      const g = customerMap[customer]
      g.count++
      if (note.status === 'done') g.done++
      else g.pending++

      g.items.push({
        id: note.id,
        title: note.title,
        content: summarizeContent(note.content),
        status: note.status,
        priority: note.priority,
        category_name: note.category_name,
        reminder_at: note.reminder_at,
        created_at: note.created_at
      })
    }

    const byCustomer = Object.values(customerMap).sort((a, b) => b.count - a.count)

    // 生成要点总结
    const highlights = []
    const doneCount = byStatus.done || 0
    if (doneCount > 0) highlights.push(`完成 ${doneCount} 项`)
    const pendingCount = byStatus.todo
    if (pendingCount > 0) highlights.push(`待跟进 ${pendingCount} 项`)
    const customerCount = byCustomer.length
    if (customerCount > 0) highlights.push(`涉及 ${customerCount} 个客户`)

    res.json({
      code: 0,
      data: {
        range,
        start,
        end,
        total,
        byStatus,
        byCustomer,
        highlights
      }
    })
  } catch (e) {
    console.error('[reports]', e)
    res.status(500).json({ code: 1, msg: '生成报告失败' })
  }
})

export default router
