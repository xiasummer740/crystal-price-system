p="electron/updater.js"
s=open(p,encoding="utf-8").read()
anchor="// 直连下载核心（带断点续传 + 重试）"
add='''// 用 Electron 的 net 下载：会走系统代理（和浏览器/autoUpdater 一致），
// 比 Node 的 https 直连 GitHub 快很多（祥哥 2026-11-09 反馈下载只有 109KB/s）。
function downloadOnceNet(url, destFile, expectedSize = 0) {
  return new Promise((resolve, reject) => {
    let resumeFrom = 0
    if (existsSync(destFile)) {
      try { resumeFrom = statSync(destFile).size || 0 } catch { resumeFrom = 0 }
    }
    const { net } = _require('electron')
    const req = net.request({ url, method: 'GET', redirect: 'follow' })
    req.setHeader('User-Agent', 'crystal-price-system')
    if (resumeFrom > 0) req.setHeader('Range', `bytes=${resumeFrom}-`)
    const timer = setTimeout(() => { try { req.abort() } catch {} ; reject(new Error('连接服务器超时')) }, 60000)
    req.on('response', (res) => {
      clearTimeout(timer)
      const status = res.statusCode
      if (status !== 200 && status !== 206) {
        reject(new Error(`HTTP ${status}`))
        return
      }
      const supportsResume = status === 206
      const contentRange = res.headers['content-range'] || ''
      const fullSize = parseInt(String(contentRange).split('/')[1] || '0', 10) || parseInt(res.headers['content-length'] || '0', 10) || expectedSize
      let downloaded = supportsResume ? resumeFrom : 0
      let lastTime = Date.now()
      let lastBytes = downloaded
      const fileStream = createWriteStream(destFile, { flags: supportsResume ? 'a' : 'w' })
      res.on('data', (chunk) => {
        downloaded += chunk.length
        if (fullSize > 0) {
          const now = Date.now()
          const elapsed = (now - lastTime) / 1000
          if (elapsed >= 1) {
            const bytesPerSecond = Math.round((downloaded - lastBytes) / elapsed)
            lastTime = now
            lastBytes = downloaded
            mainWindow?.webContents.send('update:progress', {
              percent: Math.round(downloaded / fullSize * 100),
              bytesPerSecond,
              total: fullSize,
              transferred: downloaded,
            })
          }
        }
      })
      res.on('end', () => {
        fileStream.end()
        if (expectedSize > 0 && downloaded < expectedSize) reject(new Error(`下载不完整: ${downloaded}/${expectedSize}，将续传重试`))
        else resolve()
      })
      res.on('error', reject)
      fileStream.on('error', reject)
      res.pipe(fileStream)
    })
    req.on('error', reject)
    req.end()
  })
}

'''
assert anchor in s
s=s.replace(anchor, add+anchor,1)

old='''    try {
      LOG(`downloading (attempt ${attempt}/${retries})`)
      await new Promise((resolve, reject) => {'''
new='''    try {
      LOG(`downloading (attempt ${attempt}/${retries})`)
      // 优先走 Electron net（系统代理），失败再退回 Node https
      if (process.versions.electron) {
        try {
          await downloadOnceNet(url, destFile, expectedSize)
          return
        } catch (e) {
          LOG(`net download failed: ${e.message}，改用 https 直连`)
        }
      }
      await new Promise((resolve, reject) => {'''
assert old in s
s=s.replace(old,new,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
