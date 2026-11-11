p="electron/updater.js"
s=open(p,encoding="utf-8").read()
s=s.replace("import { appendFileSync, createWriteStream, unlinkSync, existsSync, statSync, openSync, closeSync, ftruncateSync } from 'fs'","import { appendFileSync, createWriteStream, unlinkSync, existsSync, statSync, openSync, closeSync, ftruncateSync, writeSync } from 'fs'",1)

start=s.index("async function downloadParallelNet(url, destFile, expectedSize, threads = 4) {")
end=s.index("// 直连下载核心（带断点续传 + 重试）", start)
new='''async function downloadParallelNet(url, destFile, expectedSize, threads = 6) {
  const { session } = _require('electron')
  const fd = openSync(destFile, 'w')
  ftruncateSync(fd, expectedSize)
  const chunkSize = Math.ceil(expectedSize / threads)
  let downloaded = 0
  let lastTime = Date.now()
  let lastBytes = 0

  const writeAt = (buf, pos) => {
    let off = 0
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off, pos + off)
  }

  try {
    const jobs = []
    for (let i = 0; i < threads; i++) {
      const start = i * chunkSize
      const end = Math.min(expectedSize - 1, start + chunkSize - 1)
      if (start > end) break
      jobs.push((async () => {
        // 每个分片用独立 session，绕开 Chromium 单 session 的连接/并发限制
        const ses = session.fromPartition('crystal-update-' + i)
        const r = await ses.fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
        if (r.status !== 206) throw new Error(`分段下载 HTTP ${r.status}`)
        const reader = r.body.getReader()
        let pos = start
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const buf = Buffer.from(value)
          writeAt(buf, pos)
          pos += buf.length
          downloaded += buf.length
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
        }
      })())
    }
    await Promise.all(jobs)
    const finalSize = statSync(destFile).size
    if (expectedSize > 0 && finalSize !== expectedSize) throw new Error(`分段下载校验失败: ${finalSize}/${expectedSize}`)
    mainWindow?.webContents.send('update:progress', { percent: 100, bytesPerSecond: 0, total: expectedSize, transferred: expectedSize })
  } finally {
    try { closeSync(fd) } catch {}
  }
}

'''
s=s[:start]+new+s[end:]
s=s.replace("await downloadParallelNet(assetInfo.url, destFile, assetInfo.size, 4)","await downloadParallelNet(assetInfo.url, destFile, assetInfo.size, 6)",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
