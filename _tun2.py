p="client/src/views/Dashboard.vue"
s=open(p,encoding="utf-8").read()

# 顶栏版本号后加隧道状态
s=s.replace('''<span class="version-badge">v{{ appVersion }}</span>''','''<span class="version-badge">v{{ appVersion }}</span>
        <button class="tunnel-pill" :class="{ on: tunnelStatus.running }" @click="openTunnel" title="外网隧道状态（Cloudflare Tunnel）">
          <span class="tp-dot"></span>隧道
        </button>''',1)

# 底部提示加外网域名
s=s.replace('''手机端访问：同一 WiFi 用 <strong>http://{{ localIp }}:3266</strong>；人在外面用 Tailscale（点「打不开？」）''','''手机端访问：同一 WiFi 用 <strong>http://{{ localIp }}:3266</strong>
        <template v-if="tunnelStatus.url"> ｜ 外网 <a :href="tunnelStatus.url" target="_blank" style="color:var(--color-primary)">{{ tunnelStatus.url }}</a></template>
        ｜ <button class="lan-fix" @click="openTunnel">隧道状态</button>''',1)

# 隧道弹层（放在 lan popup 后）
old='''      <van-popup v-model:show="showLanHelp"'''
# 在 lan popup 结束标签后插入较复杂，改为在文件末尾模板处？直接在 lan popup 之前插入独立 popup
new='''      <van-popup v-model:show="showTunnel" round position="bottom" :style="{ maxHeight: '60%' }" closeable>
        <div class="lan-help">
          <h4>外网隧道 <small>Cloudflare Tunnel</small></h4>
          <div class="tun-row">
            <span class="tun-dot" :class="{ on: tunnelStatus.running }"></span>
            <b>{{ tunnelStatus.running ? '隧道运行中' : '隧道未运行' }}</b>
            <button class="lh-refresh" @click="refreshTunnel">重新检测</button>
          </div>
          <p class="tun-tip">手机在外地用流量时，访问下面的外网地址即可（不用 Tailscale）。</p>
          <div class="lh-title">外网地址</div>
          <div class="tun-input-row">
            <input v-model="tunnelUrlInput" class="tun-input" placeholder="https://sjk-crystal.你的域名.com" />
            <button class="lh-refresh" @click="saveTunnelUrl">保存</button>
          </div>
          <div v-if="tunnelStatus.url" class="tun-actions">
            <button class="lh-refresh" @click="copyTunnelUrl">复制地址</button>
            <a class="tun-open" :href="tunnelStatus.url" target="_blank">打开</a>
          </div>
          <p class="tun-tip" v-if="!tunnelStatus.running">隧道没运行：管理员运行 <code>Restart-Service Cloudflared</code>，或看「外网访问教程」。</p>
        </div>
      </van-popup>

      <van-popup v-model:show="showLanHelp"'''
assert old in s
s=s.replace(old,new,1)

# 状态
s=s.replace("const showLanHelp = ref(false)","const showLanHelp = ref(false)\nconst showTunnel = ref(false)\nconst tunnelStatus = ref({ running: false, url: '' })\nconst tunnelUrlInput = ref('')",1)

# 函数
anchor="function refreshLanIps() {"
add='''async function refreshTunnel() {
  try {
    const r = await http.get('/tunnel/status')
    tunnelStatus.value = r.data || { running: false, url: '' }
    tunnelUrlInput.value = tunnelStatus.value.url || ''
  } catch {}
}
function openTunnel() {
  showTunnel.value = true
  refreshTunnel()
}
async function saveTunnelUrl() {
  const url = String(tunnelUrlInput.value || '').trim().replace(/\\/+$/, '')
  await saveSettingsApi({ crystal_tunnel_url: url })
  tunnelStatus.value = { ...tunnelStatus.value, url }
  showToast(url ? '已保存外网地址' : '已清空外网地址')
}
function copyTunnelUrl() {
  if (!tunnelStatus.value.url) return
  navigator.clipboard?.writeText(tunnelStatus.value.url).then(() => showToast('已复制')).catch(() => {})
}

'''
assert anchor in s
s=s.replace(anchor,add+anchor,1)

# 初始化
s=s.replace("  refreshLanIps()","  refreshLanIps()\n  refreshTunnel()",1)

# CSS
css='''
.tunnel-pill { display: inline-flex; align-items: center; gap: 5px; margin-left: 8px; border: 1px solid #e4e7ec; background: #fff; color: #667085; border-radius: 12px; padding: 1px 8px; font-size: 11px; cursor: pointer; }
.tunnel-pill.on { color: #00794f; border-color: #b7ebd6; background: #f6fffb; }
.tp-dot { width: 7px; height: 7px; border-radius: 50%; background: #d0d5dd; }
.tunnel-pill.on .tp-dot { background: #00b96b; }
.tun-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 8px; }
.tun-dot { width: 9px; height: 9px; border-radius: 50%; background: #d0d5dd; }
.tun-dot.on { background: #00b96b; }
.tun-tip { font-size: 12px; color: #667085; margin: 6px 0; }
.tun-input-row { display: flex; gap: 8px; }
.tun-input { flex: 1; border: 1px solid #d0d5dd; border-radius: 6px; padding: 6px 9px; font-size: 12px; outline: none; }
.tun-actions { display: flex; gap: 10px; align-items: center; margin-top: 8px; }
.tun-open { font-size: 12px; color: #1677ff; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("dashboard ok")
