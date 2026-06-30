import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import os from 'os'

const router = Router()
const uploadDir = path.join(os.tmpdir(), 'crystal-translator-uploads')
try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }) } catch {}

const upload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } })

// 提取 PDF 每行文字及其精确坐标，供前端叠加覆盖
async function extractPdf(filePath) {
  const pdfjsLib = await import('pdfjs-dist')
  const buf = fs.readFileSync(filePath)
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise
  const pages = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items = content.items.filter(it => it.str && it.str.trim())

    if (!items.length) {
      pages.push({ page: i, width: vp.width, height: vp.height, lines: [] })
      continue
    }

    // 按 y 坐标从上到下排序（PDF y 从底部算，大值=页面上方）
    const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5])

    // 按行分组
    const lineGroups = []
    let cur = null
    for (const item of sorted) {
      const y = item.transform[5]
      const h = item.height || 10
      if (!cur || Math.abs(y - cur.y) > h * 0.5) {
        if (cur) lineGroups.push(cur)
        cur = { y, items: [] }
      }
      cur.items.push(item)
    }
    if (cur) lineGroups.push(cur)

    // 每行生成一条记录，携带精确坐标
    const lines = lineGroups.map(lg => {
      const si = [...lg.items].sort((a, b) => a.transform[4] - b.transform[4])
      const text = si.map(it => it.str).join(' ').trim()
      const x = si[0].transform[4]
      const h = Math.max(...lg.items.map(it => it.height || 10))
      const w = si.reduce((s, it) => s + (it.width || h * 0.6), 0)
      const yFromTop = vp.height - lg.y  // 转换为从顶部计算
      return { text, x, y: yFromTop, h, w }
    }).filter(l => l.text)

    pages.push({ page: i, width: vp.width, height: vp.height, lines })
  }
  return pages
}

async function extractDocx(filePath) {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  const lines = result.value.split('\n').filter(l => l.trim()).map((text, i) => ({
    text, x: 40, y: 40 + i * 24, h: 16, w: text.length * 8
  }))
  return [{ page: 1, width: 600, height: Math.max(800, lines.length * 24 + 80), lines }]
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    if (!file) return res.json({ code: 1, msg: '请上传文件' })
    const ext = path.extname(file.originalname).toLowerCase()
    let pages = []
    if (ext === '.pdf') {
      pages = await extractPdf(file.path)
    } else if (ext === '.docx' || ext === '.doc') {
      pages = await extractDocx(file.path)
    } else {
      try { fs.unlinkSync(file.path) } catch {}
      return res.json({ code: 1, msg: '仅支持 PDF 和 Word（.docx）格式' })
    }
    if (!pages.length) {
      try { fs.unlinkSync(file.path) } catch {}
      return res.json({ code: 1, msg: '未能提取到文本，可能是扫描件或图片型文件' })
    }
    try { fs.unlinkSync(file.path) } catch {}
    res.json({ code: 0, data: { name: file.originalname, paragraphs: pages } })
  } catch (e) {
    try { fs.unlinkSync(req.file?.path) } catch {}
    console.error('[translator]', e)
    res.json({ code: 1, msg: '文件解析失败，请确认文件格式正确' })
  }
})

// Lingva 实例列表（第一个不可用时自动 fallback，也支持环境变量自定义）
const LINGVA_INSTANCES = [
  process.env.TRANSLATE_API_URL, // 优先使用自定义地址
  'https://lingva.ml/api/v1/en/zh/',
  'https://translate.terraprint.co/api/v1/en/zh/',
].filter(Boolean)

async function translateOne(src) {
  if (!src || !src.trim()) return ''
  if (/^[\d\s.,;:+\-*/=<>%°ΩμΑ-Ωα-ω]+$/.test(src.trim())) return src.trim()
  for (const baseUrl of LINGVA_INSTANCES) {
    try {
      const url = baseUrl + encodeURIComponent(src.trim())
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const data = await res.json()
      if (data?.translation) return data.translation
    } catch { continue } // 实例不可用，尝试下一个
  }
  return src.trim() // 全部失败则返回原文
}

router.post('/translate', async (req, res) => {
  try {
    const { paragraphs } = req.body
    if (!paragraphs || !paragraphs.length) return res.json({ code: 1, msg: '没有可翻译的内容' })
    const translated = new Array(paragraphs.length)
    for (let i = 0; i < paragraphs.length; i += 5) {
      const batch = paragraphs.slice(i, i + 5).map((p, j) =>
        translateOne(p).then(r => { translated[i + j] = r })
      )
      await Promise.all(batch)
    }
    res.json({ code: 0, data: { translated } })
  } catch (e) {
    console.error('[translate]', e)
    res.json({ code: 1, msg: '翻译失败，请检查网络连接后重试' })
  }
})

export default router
