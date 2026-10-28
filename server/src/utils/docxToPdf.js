/**
 * docx → PDF（Windows + Office Word COM），串行队列。
 * 与 xlsxToPdf 同思路：Word 的 ExportAsFixedFormat(17) 导出 PDF。
 */
import { execFile } from 'child_process'
import path from 'path'

let queue = Promise.resolve()

export function docxToPdf(docxPath, pdfPath, timeoutMs = 180000) {
  const job = queue.then(() => convert(docxPath, pdfPath, timeoutMs))
  queue = job.catch(() => {})
  return job
}

function convert(docxPath, pdfPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('PDF 导出仅支持 Windows'))
    // Word COM 的工作目录是 system32，相对路径会找不到文件 —— 一律转绝对路径
    docxPath = path.resolve(docxPath)
    pdfPath = path.resolve(pdfPath)
    const q = (s) => String(s).replace(/'/g, "''")
    const script = [
      "$ErrorActionPreference = 'Stop'",
      '$w = New-Object -ComObject Word.Application',
      '$w.Visible = $false',
      '$w.DisplayAlerts = 0',
      'try {',
      `  $d = $w.Documents.Open('${q(docxPath)}', $false, $true)`,
      `  $d.ExportAsFixedFormat('${q(pdfPath)}', 17)`,
      '  $d.Close($false)',
      '} finally {',
      '  $w.Quit()',
      '}'
    ].join('\r\n')
    const b64 = Buffer.from(script, 'utf16le').toString('base64')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
      { timeout: timeoutMs, windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message || 'PDF 导出失败').trim()))
        resolve(pdfPath)
      }
    )
  })
}
