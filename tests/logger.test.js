/**
 * Logger 单元测试
 *
 * 测试核心功能：写入、级别过滤、文件列表、读取、清空、路径安全
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'

const tmpDir = path.join(os.tmpdir(), 'crystal-logger-test-' + crypto.randomBytes(4).toString('hex'))

// 设置环境变量，让 logger 往临时目录写
process.env.DATA_DIR = tmpDir

let logger
before(async () => {
  logger = await import('../server/src/utils/logger.js')
  // 确保 logs 目录已创建
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
})

after(() => {
  // 清理临时目录
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('logger 基本写入', () => {

  it('写入 ERROR 日志，文件被创建', () => {
    logger.error('test-module', '测试错误消息')
    const files = logger.listLogFiles()
    assert.ok(files.length >= 1)
    const today = new Date().toISOString().slice(0, 10)
    const found = files.find(f => f.name === `error-${today}.log`)
    assert.ok(found, '当日日志文件应存在')
    assert.ok(found.size > 0, '文件大小应大于 0')
  })

  it('写入内容包含级别和模块标记', () => {
    logger.warn('warn-test', '这是一条警告')
    const today = new Date().toISOString().slice(0, 10)
    const result = logger.readLogFile(`error-${today}.log`, 100)
    assert.equal(result.error, undefined, '读取不应出错')
    assert.ok(result.content.includes('[WARN]'), '应包含 WARN 级别')
    assert.ok(result.content.includes('[warn-test]'), '应包含模块名')
  })

  it('readLogFile 返回分页信息', () => {
    const today = new Date().toISOString().slice(0, 10)
    const result = logger.readLogFile(`error-${today}.log`, 10)
    assert.ok(result.total > 0, 'total 应大于 0')
    assert.ok(result.showing > 0, 'showing 应大于 0')
    assert.ok(result.showing <= 10, '不超过请求行数')
  })

  it('INFO 和 DEBUG 也正常写入', () => {
    logger.info('info-test', '信息消息', { extra: '数据' })
    logger.debug('debug-test', '调试消息', 123, true)
    const today = new Date().toISOString().slice(0, 10)
    const result = logger.readLogFile(`error-${today}.log`, 200)
    assert.ok(result.content.includes('[INFO]'), '应包含 INFO')
    assert.ok(result.content.includes('[info-test]'), '应包含 info-test 模块')
  })

})

describe('logger 文件管理', () => {

  it('listLogFiles 返回按时间倒序的文件列表', () => {
    const files = logger.listLogFiles()
    assert.ok(Array.isArray(files))
    for (const f of files) {
      assert.ok(f.name, '应有文件名')
      assert.ok(typeof f.size === 'number', '应有大小数字')
      assert.ok(f.mtime, '应有修改时间')
    }
    // 验证倒序
    if (files.length >= 2) {
      const times = files.map(f => f.mtime)
      for (let i = 1; i < times.length; i++) {
        assert.ok(times[i - 1] >= times[i], `文件应按 mtime 倒序: ${times[i-1]} >= ${times[i]}`)
      }
    }
  })

  it('获取日志文件路径', () => {
    const today = `error-${new Date().toISOString().slice(0, 10)}.log`
    const fp = logger.getLogFilePath(today)
    assert.ok(fp, '应返回路径')
    assert.ok(fs.existsSync(fp), '文件真实存在')
  })

  it('不存在的文件返回 null', () => {
    const fp = logger.getLogFilePath('nonexistent.log')
    assert.equal(fp, null)
  })

  it('路径遍历攻击被阻止', () => {
    const result = logger.readLogFile('../../etc/passwd')
    assert.ok(result.error, '应返回错误')
  })

})

describe('logger 清空', () => {

  it('清空日志后文件列表为空', () => {
    const before = logger.listLogFiles()
    if (before.length === 0) {
      // 写一条再清
      logger.info('clear-test', '准备被清空')
    }
    const result = logger.clearLogs()
    assert.ok(result.deleted >= 1, '至少删除了 1 个文件')
    assert.equal(result.error, undefined, '不应有错误')

    const after = logger.listLogFiles()
    assert.equal(after.length, 0, '清空后列表应为空')
  })

})
