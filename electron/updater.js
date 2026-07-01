// 自动在线升级 — 使用 Electron net.request（Chromium 网络栈，兼容性最好）
// 2026-07-01 v3: net.request 替代 https 模块，解决打包后网络请求问题

import { app, ipcMain, net } from 'electron'
import path from 'path'
import fs from 'fs'

const BASE = 'https://github.com/xiasummer740/crystal-price-system/releases/latest/download'

let mainWindow = null
let updateInfo = null

function log(msg) {
  try {
    const logPath = path.join(app.getPath('documents'), 'update.log')
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(logPath, line)
  } catch {}
}

function send(data) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', data)
    }
  } catch {}
}

// 用 net.request 获取文本（Chromium 网络栈，支持代理/重定向/TLS）
function netFetchText(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = net.request(url)
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; req.abort(); reject(new Error('请求超时')) }, timeoutMs)
    req.on('response', (resp) => {
      clearTimeout(timer)
      if (timedOut) return
      // net.request 默认跟重定向，最终 statusCode 是 200
      if (resp.statusCode !== 200) {
        reject(new Error(`HTTP ${resp.statusCode}`))
        return
      }
      const chunks = []
      resp.on('data', c => chunks.push(c))
      resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('error', (e) => { clearTimeout(timer); reject(e) })
    req.end()
  })
}

// 用 net.request 下载文件
function netDownload(url, destPath, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    const req = net.request(url)
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; req.abort(); file.close(); fs.unlinkSync(destPath); reject(new Error('下载超时')) }, timeoutMs)
    req.on('response', (resp) => {
      clearTimeout(timer)
      if (timedOut) return
      if (resp.statusCode !== 200) {
        file.close(); fs.unlinkSync(destPath)
        reject(new Error(`HTTP ${resp.statusCode}`))
        return
      }
      resp.on('data', c => file.write(Buffer.from(c)))
      resp.on('end', () => { file.close(); resolve() })
      resp.on('error', (e) => { file.close(); fs.unlinkSync(destPath); reject(e) })
    })
    req.on('error', (e) => { clearTimeout(timer); file.close(); fs.unlinkSync(destPath); reject(e) })
    req.end()
  })
}

export function initUpdater(win) {
  mainWindow = win

  ipcMain.handle('check-update', async () => {
    log('IPC: 检查更新')
    send({ status: 'checking' })

    try {
      const currentVersion = app.getVersion()
      log(`当前版本: v${currentVersion}`)

      const ymlText = await netFetchText(`${BASE}/latest.yml`)
      log('latest.yml 获取成功')

      const versionMatch = ymlText.match(/^version:\s*(.+)$/m)
      const pathMatch = ymlText.match(/^path:\s*(.+)$/m)
      const remoteVersion = versionMatch?.[1]?.trim()
      const remotePath = pathMatch?.[1]?.trim()

      if (!remoteVersion || !remotePath) {
        throw new Error('无法解析 latest.yml')
      }
      log(`远程: v${remoteVersion}, 路径: ${remotePath}`)

      if (remoteVersion === currentVersion) {
        log('已是最新')
        send({ status: 'not-available' })
        return true
      }

      log(`发现新版本: v${remoteVersion}`)
      updateInfo = { version: remoteVersion, path: remotePath }
      send({ status: 'available', version: remoteVersion })
      return true

    } catch (e) {
      log('检查失败: ' + (e?.message || e))
      send({ status: 'error', message: e?.message || '未知错误' })
      return true
    }
  })

  ipcMain.handle('download-update', async () => {
    if (!updateInfo) return { success: false, msg: '没有可用更新' }
    log('IPC: 下载更新')
    try {
      const exeName = updateInfo.path
      const url = `${BASE}/${exeName}`
      const dest = path.join(app.getPath('temp'), exeName)
      log(`下载: ${url}`)
      send({ status: 'downloading', percent: 0 })
      await netDownload(url, dest)
      log('下载完成')
      updateInfo.downloadPath = dest
      send({ status: 'downloaded', version: updateInfo.version })
      return { success: true }
    } catch (e) {
      log('下载失败: ' + (e?.message || e))
      return { success: false, msg: e?.message || '下载失败' }
    }
  })

  ipcMain.handle('install-update', async () => {
    if (!updateInfo?.downloadPath) return { success: false, msg: '安装包未下载' }
    log('IPC: 安装更新')
    try {
      const { execSync } = await import('child_process')
      execSync(`"${updateInfo.downloadPath}" /S`, { timeout: 5000 })
      app.quit()
      return { success: true }
    } catch (e) {
      log('安装失败: ' + (e?.message || e))
      return { success: false, msg: e?.message || '安装失败' }
    }
  })
}

export function checkForUpdates() {
  setTimeout(async () => {
    log('自动检查更新...')
    try {
      const currentVersion = app.getVersion()
      const ymlText = await netFetchText(`${BASE}/latest.yml`, 15000)
      const match = ymlText.match(/^version:\s*(.+)$/m)
      const remoteVersion = match?.[1]?.trim()
      if (remoteVersion && remoteVersion !== currentVersion) {
        updateInfo = { version: remoteVersion }
        send({ status: 'available', version: remoteVersion })
      }
    } catch {}
  }, 15000)
}
