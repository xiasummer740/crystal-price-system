// 总结汇报 API — 日报/周报/月报
// 按客户分组汇总记事，自动 OCR 图片文字

import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Tesseract from 'tesseract.js'
import { queryAll } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = Router()

const notesUploadDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..'), '记事图片库')

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
    case 'month':
      start = fmt(new Date(now.getFullYear(), now.getMonth(), 1)) + ' 00:00:00'
      end = fmt(now) + ' 23:59:59'
      break
    default:
      // 自定义范围
      start = fmt(now) + ' 00:00:00'
      end = fmt(now) + ' 23:59:59'
  }
  return { start, end }
}

// 从 notes.images 字段提取图片文件路径
function parseImagePaths(imagesJson) {
  try {
    const urls = JSON.parse(imagesJson || '[]')
    return urls.map(url => {
      const name = decodeURIComponent(url.split('/').pop())
      return path.join(notesUploadDir, name)
    }).filter(fp => fs.existsSync(fp))
  } catch { return [] }
}

// OCR 一张图片
async function ocrImage(filePath) {
  try {
    const { data } = await Tesseract.recognize(filePath, 'chi_sim+eng', {
      logger: () => {} // 静默运行
    })
    return data.text.trim()
  } catch {
    return ''
  }
}

// 截取文本摘要（取前若干字）
function summary(text, maxLen = 80) {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  return clean.slice(0, maxLen) + '…'
}

// 生成简单摘要：提取关键词/要点
function summarizeContent(content) {
  if (!content || !content.trim()) return ''
  const lines = content.split('\n').filter(l => l.trim())
  // 取前 3 行非空内容，每行截断
  return lines.slice(0, 3).map(l => summary(l, 60)).join(' → ')
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
      WHERE n.is_deleted = 0 AND n.created_at >= ? AND n.created_at <= ?
      ORDER BY n.customer ASC, n.created_at DESC
    `, [start, end])

    // 统计
    const total = notes.length
    const byStatus = { todo: 0, in_progress: 0, done: 0 }
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

      // OCR：只对图片附件执行，缓存计算结果
      let ocrText = ''
      const imagePaths = parseImagePaths(note.images)
      if (imagePaths.length > 0) {
        // 只 OCR 第一张（避免太多请求），超时 5 秒
        const ocrPromise = ocrImage(imagePaths[0])
        const timeout = new Promise(r => setTimeout(() => r(''), 5000))
        ocrText = await Promise.race([ocrPromise, timeout])
      }

      g.items.push({
        id: note.id,
        title: note.title,
        content: summarizeContent(note.content),
        status: note.status,
        priority: note.priority,
        category_name: note.category_name,
        reminder_at: note.reminder_at,
        created_at: note.created_at,
        hasImages: imagePaths.length > 0,
        ocrText: ocrText ? summary(ocrText, 100) : ''
      })
    }

    const byCustomer = Object.values(customerMap).sort((a, b) => b.count - a.count)

    // 生成要点总结
    const highlights = []
    const doneCount = byStatus.done || 0
    if (doneCount > 0) highlights.push(`完成 ${doneCount} 项`)
    const pendingCount = byStatus.todo + byStatus.in_progress
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
