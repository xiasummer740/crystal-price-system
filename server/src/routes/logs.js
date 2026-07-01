/**
 * 日志管理 API
 *
 * GET    /api/logs            — 列出日志文件
 * GET    /api/logs/:filename  — 读取日志内容（?lines=500）
 * GET    /api/logs/:filename/download — 下载日志文件
 * DELETE /api/logs            — 清空所有日志
 */
import { Router } from 'express'
import * as logger from '../utils/logger.js'

const router = Router()

// 列出日志文件
router.get('/', (_req, res) => {
  try {
    const files = logger.listLogFiles()
    res.json({ code: 0, data: files })
  } catch (e) {
    logger.error('logs', `列表读取失败: ${e.message}`)
    res.status(500).json({ code: 1, msg: '读取日志列表失败' })
  }
})

// 读取日志内容
router.get('/:filename', (req, res) => {
  const { filename } = req.params
  // 路径安全校验
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ code: 1, msg: '文件名非法' })
  }
  const maxLines = Math.min(parseInt(req.query.lines) || 500, 10000)
  const result = logger.readLogFile(filename, maxLines)
  if (result.error) {
    return res.status(404).json({ code: 1, msg: result.error })
  }
  res.json({ code: 0, data: result })
})

// 下载日志文件
router.get('/:filename/download', (req, res) => {
  const { filename } = req.params
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ code: 1, msg: '文件名非法' })
  }
  const fp = logger.getLogFilePath(filename)
  if (!fp) {
    return res.status(404).json({ code: 1, msg: '文件不存在' })
  }
  res.download(fp, filename)
})

// 清空日志
router.delete('/', (_req, res) => {
  try {
    const result = logger.clearLogs()
    if (result.error) {
      return res.status(500).json({ code: 1, msg: result.error })
    }
    logger.info('logs', `清空了 ${result.deleted} 个日志文件`)
    res.json({ code: 0, data: result, msg: `已删除 ${result.deleted} 个日志文件` })
  } catch (e) {
    logger.error('logs', `清空失败: ${e.message}`)
    res.status(500).json({ code: 1, msg: '清空日志失败' })
  }
})

export default router
