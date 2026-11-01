p="server/src/index.js"
s=open(p,encoding="utf-8").read()
anchor="// 全局错误捕获中间件（必须在所有路由之后）"
add='''// 隧道状态（Cloudflare Tunnel 服务是否在跑 + 已配置的外网地址）
app.get('/api/tunnel/status', (_req, res) => {
  const url = queryAll("SELECT value FROM app_settings WHERE key = 'crystal_tunnel_url'")[0]?.value || ''
  if (process.platform !== 'win32') return res.json({ code: 0, data: { running: false, url, supported: false } })
  execFile('sc', ['query', 'Cloudflared'], (err, stdout) => {
    const running = !err && /STATE\\s*:\\s*\\d+\\s+RUNNING/i.test(stdout)
    res.json({ code: 0, data: { running, url, supported: true } })
  })
})

'''
assert anchor in s
s=s.replace(anchor,add+anchor,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
