p="electron/preload.cjs"
s=open(p,encoding="utf-8").read()
old='''function getLanIp() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}'''
new='''function lanIpScore(name, ip) {
  let score = 0
  if (/wi-?fi|wlan|wireless|无线/i.test(name)) score += 50
  if (/ethernet|以太网|本地连接/i.test(name)) score += 40
  if (/vethernet|vmware|virtualbox|hyper-v|docker|wsl|tap|tailscale|zerotier|vpn|loopback/i.test(name)) score -= 100
  if (/^192\\.168\\./.test(ip)) score += 30
  else if (/^10\\./.test(ip)) score += 20
  else if (/^172\\.(1[6-9]|2\\d|3[01])\\./.test(ip)) score += 10
  return score
}
function getLanIps() {
  const interfaces = os.networkInterfaces()
  const list = []
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      list.push({ name, address: iface.address, score: lanIpScore(name, iface.address) })
    }
  }
  list.sort((a, b) => b.score - a.score)
  return list.map(({ name, address }) => ({ name, address }))
}
function getLanIp() {
  return getLanIps()[0]?.address || '127.0.0.1'
}'''
assert old in s
s=s.replace(old,new,1)
s=s.replace("  getLanIp,","  getLanIp,\n  getLanIps,",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("preload ok")
