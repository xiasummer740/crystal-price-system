/**
 * xlsx → pdf（Excel COM）
 *
 * 为什么走 Excel：合同版式是照 Excel 样张复刻的，用 Excel 自己导出 PDF 才能**一比一**
 * （列宽、93% 缩放、公章位置、分页全都不用再实现一遍）。机器上装了 Office 就能用；
 * 没装/导出失败时调用方只返回 xlsx，不挡生成。
 *
 * 注意：
 * - 用 `-EncodedCommand` 传脚本，避免中文路径/引号在 PowerShell 命令行里被吃掉；
 * - Excel COM 是单实例的，多个请求同时导会互相抢 → 这里用一条 promise 链串行；
 * - 每次导出都 Quit + ReleaseComObject，别把 EXCEL.EXE 留在后台。
 */
import { execFile } from 'child_process'
import fs from 'fs'

const PS_SCRIPT = (xlsx, pdf) => `
$ErrorActionPreference = 'Stop'
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open('${String(xlsx).replace(/'/g, "''")}', 0, $true)
  $wb.ExportAsFixedFormat(0, '${String(pdf).replace(/'/g, "''")}')
  $wb.Close($false)
} finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
`

let queue = Promise.resolve()

function convert(xlsxAbs, pdfAbs, timeoutMs) {
  return new Promise((resolve, reject) => {
    const script = PS_SCRIPT(xlsxAbs, pdfAbs)
    const b64 = Buffer.from(script, 'utf16le').toString('base64')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
      { timeout: timeoutMs, windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message || 'PDF 导出失败').trim()))
        if (!fs.existsSync(pdfAbs)) return reject(new Error('PDF 未生成'))
        resolve(pdfAbs)
      }
    )
  })
}

/**
 * @param {string} xlsxAbs 绝对路径
 * @param {string} pdfAbs  绝对路径
 * @param {number} timeoutMs
 * @returns {Promise<string>} pdfAbs
 */
export function xlsxToPdf(xlsxAbs, pdfAbs, timeoutMs = 120000) {
  const run = queue.then(() => convert(xlsxAbs, pdfAbs, timeoutMs))
  // 无论成功失败都让队列继续（失败不能把后面的 PDF 全卡死）
  queue = run.catch(() => {})
  return run
}
