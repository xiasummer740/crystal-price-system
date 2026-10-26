/**
 * 客户文件柜：在「客户管理/<客户>/客户文件/」下建文件夹、上传/拖入/粘贴文件。
 *
 * 需求（祥哥 2026-10-26）：某客户或某颗物料相关的文件想单独建个文件夹，
 * 默认名字「日期(YYMMDD)+晶科鑫料号」，后面还能加后缀或整个自定义；
 * 路径放在客户名下，文件支持上传 / 拖入 / Ctrl+V 粘贴。
 *
 * 安全：
 *   - 文件夹名、文件名一律 sanitize，禁止路径分隔符和 ..
 *   - 所有路径都用 path.join(root, ...) 后再校验 startsWith(root)
 *   - 只允许操作「客户文件」这一层，不碰规格书/订单/记事
 */
import { Router } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import multer from 'multer'
import { execFile } from 'child_process'
import * as A from '../utils/customerArchive.js'
import { copyFileToClipboard } from '../utils/clipboardFile.js'

const router = Router()
const ROOT_NAME = '客户文件'

function safeName(raw, fallback = '') {
  const s = String(raw ?? '')
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (s || fallback).slice(0, 100)
}

function filesRoot(customer) {
  return A.ensureDir(path.join(A.customerDirAbs(customer), ROOT_NAME))
}

function folderAbs(customer, folder) {
  const root = filesRoot(customer)
  const name = safeName(folder)
  if (!name) return null
  const abs = path.join(root, name)
  if (!abs.startsWith(root + path.sep)) return null
  return { root, name, abs }
}

function uniquePath(dir, name) {
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let p = path.join(dir, name)
  let i = 1
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`)
  return p
}

/** multer/busboy 对 multipart 文件名按 latin1 解码，中文会乱码；转 utf8，转坏就保留原样 */
function fixFileName(raw) {
  const s = String(raw || '')
  if (!s || /[\u4e00-\u9fa5]/.test(s)) return s
  const t = Buffer.from(s, 'latin1').toString('utf8')
  return t.includes('\uFFFD') ? s : t
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, fs.mkdtempSync(path.join(os.tmpdir(), 'crystal-cfile-'))),
    filename: (_req, file, cb) => cb(null, String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8))
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 20 }
})

// ===== 列出所有文件夹 + 文件 =====
router.get('/', (req, res) => {
  try {
    const customer = String(req.query.customer || '').trim()
    if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })
    const root = filesRoot(customer)
    const folders = []
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const abs = path.join(root, e.name)
      const files = []
      for (const f of fs.readdirSync(abs, { withFileTypes: true })) {
        if (!f.isFile() || f.name.startsWith('.')) continue
        let st
        try { st = fs.statSync(path.join(abs, f.name)) } catch { continue }
        files.push({ name: f.name, size: st.size, mtime: st.mtime.toISOString() })
      }
      files.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
      folders.push({ name: e.name, files })
    }
    folders.sort((a, b) => String(b.name).localeCompare(String(a.name)))
    res.json({ code: 0, data: { folders, relRoot: path.join(A.DIR.customers, A.customerFolder(customer), ROOT_NAME) } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '读取客户文件失败: ' + e.message })
  }
})

// ===== 新建文件夹 =====
router.post('/mkdir', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const hit = folderAbs(customer, req.body?.name)
    if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })
    if (!hit) return res.status(400).json({ code: 1, msg: '文件夹名不合法' })
    if (fs.existsSync(hit.abs)) return res.status(400).json({ code: 1, msg: '文件夹「' + hit.name + '」已存在' })
    fs.mkdirSync(hit.abs, { recursive: true })
    res.json({ code: 0, data: { name: hit.name } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '新建失败: ' + e.message })
  }
})

// ===== 上传（多文件）=====
router.post('/upload', upload.array('files', 20), (req, res) => {
  const tmpDirs = []
  try {
    const customer = String(req.body?.customer || '').trim()
    const hit = folderAbs(customer, req.body?.folder)
    if (!customer) return res.status(400).json({ code: 1, msg: '缺少客户' })
    if (!hit) return res.status(400).json({ code: 1, msg: '文件夹名不合法' })
    if (!fs.existsSync(hit.abs)) fs.mkdirSync(hit.abs, { recursive: true })
    if (!req.files?.length) return res.status(400).json({ code: 1, msg: '没有收到文件' })
    const saved = []
    for (const f of req.files) {
      tmpDirs.push(path.dirname(f.path))
      let name = safeName(fixFileName(f.originalname), '文件')
      const dest = uniquePath(hit.abs, name)
      fs.renameSync(f.path, dest)
      saved.push({ name: path.basename(dest), size: fs.statSync(dest).size })
    }
    res.json({ code: 0, data: { folder: hit.name, files: saved } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '上传失败: ' + e.message })
  } finally {
    for (const d of new Set(tmpDirs)) { try { fs.rmSync(d, { recursive: true, force: true }) } catch {} }
  }
})

// ===== 删除文件 =====
router.post('/delete', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const hit = folderAbs(customer, req.body?.folder)
    const name = safeName(req.body?.name)
    if (!customer || !hit || !name) return res.status(400).json({ code: 1, msg: '参数不合法' })
    const abs = path.join(hit.abs, name)
    if (!abs.startsWith(hit.abs + path.sep)) return res.status(400).json({ code: 1, msg: '路径不合法' })
    if (!fs.existsSync(abs)) return res.status(404).json({ code: 1, msg: '文件不存在' })
    fs.unlinkSync(abs)
    res.json({ code: 0, data: { name } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '删除失败: ' + e.message })
  }
})

// ===== 删除空文件夹 =====
router.post('/delete-folder', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const hit = folderAbs(customer, req.body?.folder)
    if (!customer || !hit) return res.status(400).json({ code: 1, msg: '参数不合法' })
    if (!fs.existsSync(hit.abs)) return res.status(404).json({ code: 1, msg: '文件夹不存在' })
    if (fs.readdirSync(hit.abs).length) return res.status(400).json({ code: 1, msg: '文件夹里还有文件，先删文件' })
    fs.rmdirSync(hit.abs)
    res.json({ code: 0, data: { name: hit.name } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '删除文件夹失败: ' + e.message })
  }
})

// ===== 复制文件到剪贴板（粘微信）=====
router.post('/copy', async (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const hit = folderAbs(customer, req.body?.folder)
    const name = safeName(req.body?.name)
    if (!customer || !hit || !name) return res.status(400).json({ code: 1, msg: '参数不合法' })
    const abs = path.join(hit.abs, name)
    if (!abs.startsWith(hit.abs + path.sep) || !fs.existsSync(abs)) return res.status(404).json({ code: 1, msg: '文件不存在' })
    await copyFileToClipboard(abs)
    res.json({ code: 0, data: { name } })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '复制失败: ' + e.message })
  }
})

// ===== 在资源管理器里定位 =====
router.post('/open', (req, res) => {
  try {
    const customer = String(req.body?.customer || '').trim()
    const hit = folderAbs(customer, req.body?.folder)
    const name = safeName(req.body?.name)
    if (!customer || !hit) return res.status(400).json({ code: 1, msg: '参数不合法' })
    const target = name ? path.join(hit.abs, name) : hit.abs
    if (!target.startsWith(hit.root + path.sep) || !fs.existsSync(target)) return res.status(404).json({ code: 1, msg: '不存在' })
    if (process.platform === 'win32') execFile('explorer.exe', [`/select,${target}`], () => {})
    res.json({ code: 0 })
  } catch (e) {
    res.status(500).json({ code: 1, msg: '打开失败: ' + e.message })
  }
})

export default router
