p="electron/updater.js"
s=open(p,encoding="utf-8").read()
s=s.replace("import { appendFileSync, createWriteStream, unlinkSync, existsSync, statSync } from 'fs'","import { appendFileSync, createWriteStream, unlinkSync, existsSync, statSync, openSync, closeSync, ftruncateSync } from 'fs'",1)

anchor="// 直连下载核心（带断点续传 + 重试）"
add='''/**
 * 多线程分段下载（走 Electron net / 系统代理）。
 * 单连接被 GitHub/代理限速时，4 路 Range 并行通常能快 5-8 倍。
 */
async function downloadParallelNet(url, destFile, expectedSize, threads = 4) {
  const { net } = _require('electron')
  try { unlinkSync(destFile) } catch {}
  const fd = openSync(destFile, 'w')
  ftruncateSync(fd, expectedSize)
  closeSync(fd)

  const chunkSize = Math.ceil(expectedSize / threads)
  let downloaded = 0
  let lastTime = Date.now()
  let lastBytes = 0
  let aborted = false
  const requests = []

  const downloadChunk = (start, end) => new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET', redirect: 'follow' })
    req.setHeader('User-Agent', 'crystal-price-system')
    req.setHeader('Range', `bytes=${start}-${end}`)
    requests.push(req)
    req.on('response', (res) => {
      if (res.statusCode !== 206) {
        try { req.abort() } catch {}
        reject(new Error(`分段下载不支持 Range（HTTP ${res.statusCode}）`))
        return
      }
      const ws = createWriteStream(destFile, { flags: 'r+', start })
      res.on('data', (chunk) => {
        downloaded += chunk.length
        const now = Date.now()
        if (now - lastTime >= 1000) {
          const bps = Math.round((downloaded - lastBytes) / ((now - lastTime) / 1000))
          lastTime = now
          lastBytes = downloaded
          mainWindow?.webContents.send('update:progress', {
            percent: Math.round(downloaded / expectedSize * 100),
            bytesPerSecond: bps,
            total: expectedSize,
            transferred: downloaded,
          })
        }
      })
      res.on('end', () => { ws.end(); resolve() })
      res.on('error', reject)
      ws.on('error', reject)
      res.pipe(ws)
    })
    req.on('error', reject)
    req.end()
  })

  try {
    const jobs = []
    for (let i = 0; i < threads; i++) {
      const start = i * chunkSize
      const end = Math.min(expectedSize - 1, start + chunkSize - 1)
      if (start > end) break
      jobs.push(downloadChunk(start, end))
    }
    await Promise.all(jobs)
    const finalSize = statSync(destFile).size
    if (expectedSize > 0 && finalSize !== expectedSize) throw new Error(`分段下载校验失败: ${finalSize}/${expectedSize}`)
    mainWindow?.webContents.send('update:progress', { percent: 100, bytesPerSecond: 0, total: expectedSize, transferred: expectedSize })
  } catch (e) {
    aborted = true
    requests.forEach(r => { try { r.abort() } catch {} })
    throw e
  }
}

'''
assert anchor in s
s=s.replace(anchor, add+anchor,1)

# directDownload：大文件优先并行，失败回退单线程
old='''    await downloadWithRetry(assetInfo.url, destFile, assetInfo.size)'''
new='''    // 大文件先试 4 路并行（GitHub 单连接常被限速到 ~100KB/s）
    let parallelOk = false
    if (process.versions.electron && assetInfo.size > 20 * 1024 * 1024) {
      try {
        await downloadParallelNet(assetInfo.url, destFile, assetInfo.size, 4)
        parallelOk = true
      } catch (e) {
        LOG(`并行下载失败: ${e.message}，回退单线程`)
      }
    }
    if (!parallelOk) await downloadWithRetry(assetInfo.url, destFile, assetInfo.size)'''
assert old in s
s=s.replace(old,new,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
