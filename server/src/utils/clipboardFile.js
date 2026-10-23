/**
 * 把文件放进 Windows 系统剪贴板（CF_HDROP），粘到微信/QQ/资源管理器就是「一个文件」。
 *
 * 浏览器 Clipboard API 只支持图片/文本，PDF/Word/Excel 这类必须走系统层 —— PowerShell 的
 * `Set-Clipboard -Path` 等价于资源管理器里右键复制。
 *
 * 只在 Windows 可用；其它平台直接拒绝，由调用方给提示。
 */
import { execFile } from 'child_process'

export function copyFileToClipboard(absPath, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return reject(new Error('只有 Windows 桌面版支持复制文件'))
    }
    const script = `Set-Clipboard -Path '${String(absPath).replace(/'/g, "''")}'`
    const b64 = Buffer.from(script, 'utf16le').toString('base64')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
      { timeout: timeoutMs, windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message || '复制失败').trim()))
        resolve(absPath)
      }
    )
  })
}
