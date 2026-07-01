/**
 * 文件日志工具 — 按日期轮转，多级别日志
 *
 * 日志目录: {DATA_DIR}/logs/error-YYYY-MM-DD.log
 * 格式: [ISO时间戳] [级别] [模块] 消息\n
 *
 * 级别: ERROR > WARN > INFO > DEBUG
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 }
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.INFO

let _logDir = null

/** 获取 logs 目录，不存在则创建 */
function getLogDir() {
  if (_logDir) return _logDir
  const base = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  _logDir = path.join(base, 'logs')
  if (!fs.existsSync(_logDir)) fs.mkdirSync(_logDir, { recursive: true })
  return _logDir
}

/** 获取当天的日志文件路径 */
function logFilePath() {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return path.join(getLogDir(), `error-${date}.log`)
}

/** 写一行日志 */
function write(level, module, msg, ...args) {
  if ((LOG_LEVELS[level] ?? -1) > CURRENT_LEVEL) return
  const ts = new Date().toISOString()
  let text = typeof msg === 'string' ? msg : ''
  try { text = JSON.stringify(msg) } catch {}
  const extra = args.length ? ' ' + args.map(a => { try { return typeof a === 'string' ? a : JSON.stringify(a) } catch { return String(a) } }).join(' ') : ''
  const line = `[${ts}] [${level}] [${module}] ${text}${extra}\n`
  try { fs.appendFileSync(logFilePath(), line, 'utf8') } catch (e) { console.error('[logger] write failed:', e.message) }
  // 同时输出到控制台
  if (level === 'ERROR') console.error(line.trim())
  else console.log(line.trim())
}

export function error(module, msg, ...args) { write('ERROR', module, msg, ...args) }
export function warn(module, msg, ...args) { write('WARN', module, msg, ...args) }
export function info(module, msg, ...args) { write('INFO', module, msg, ...args) }
export function debug(module, msg, ...args) { write('DEBUG', module, msg, ...args) }

/** 列出所有日志文件（按修改时间倒序） */
export function listLogFiles() {
  const dir = getLogDir()
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.log'))
      .map(f => {
        const fp = path.join(dir, f)
        try {
          const stat = fs.statSync(fp)
          return { name: f, size: stat.size, mtime: stat.mtime.toISOString() }
        } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
  } catch { return [] }
}

/** 读取指定日志文件内容，支持分页（行数） */
export function readLogFile(filename, maxLines = 500) {
  const dir = getLogDir()
  const fp = path.join(dir, filename)
  // 路径安全：禁止目录遍历
  if (fp.indexOf('..') !== -1 || !fs.existsSync(fp) || !fp.startsWith(dir)) {
    return { error: '文件不存在或路径非法' }
  }
  try {
    const content = fs.readFileSync(fp, 'utf8')
    const lines = content.split('\n').filter(Boolean)
    const total = lines.length
    const tail = lines.slice(-maxLines)
    return { content: tail.join('\n'), total, showing: Math.min(maxLines, total) }
  } catch (e) {
    return { error: e.message }
  }
}

/** 获取日志文件完整路径 */
export function getLogFilePath(filename) {
  const dir = getLogDir()
  const fp = path.join(dir, filename)
  if (fp.indexOf('..') !== -1 || !fs.existsSync(fp) || !fp.startsWith(dir)) return null
  return fp
}

/** 清空所有日志文件 */
export function clearLogs() {
  const dir = getLogDir()
  let count = 0
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.log')) {
        fs.unlinkSync(path.join(dir, f))
        count++
      }
    }
  } catch (e) { return { error: e.message } }
  return { deleted: count }
}
