p="client/src/views/Dashboard.vue"
s=open(p,encoding="utf-8").read()
old='''      <div class="lan-tip">手机端访问：同一 WiFi，浏览器访问 <strong>http://{{ localIp }}:3266</strong> ｜ <a href="/使用手册.html" target="_blank" style="color:var(--color-primary)">使用手册</a></div>'''
new='''      <div class="lan-tip">
        手机端访问：同一 WiFi，浏览器访问 <strong>http://{{ localIp }}:3266</strong>
        <button class="lan-fix" @click="showLanHelp = true; refreshLanIps()">打不开？</button>
        ｜ <a href="/使用手册.html" target="_blank" style="color:var(--color-primary)">使用手册</a>
      </div>

      <van-popup v-model:show="showLanHelp" round position="bottom" :style="{ maxHeight: '70%' }" closeable>
        <div class="lan-help">
          <h4>手机打不开？按顺序检查</h4>
          <ol class="lh-steps">
            <li>手机和电脑连的是<b>同一个 WiFi</b>（不能一个 WiFi 一个 4G）</li>
            <li>用下面「WLAN / 以太网」那条地址，不要用 vEthernet / VMware / VPN 的</li>
            <li>Windows 防火墙放行：控制面板 → Windows Defender 防火墙 → 允许应用通过 → 勾选本程序（专用网络）</li>
            <li>公司 WiFi 若开了「AP 隔离」，手机也访问不到电脑，需要让网管关掉</li>
            <li>电脑上开着 VPN / 虚拟机时，优先看 WLAN 那条地址</li>
          </ol>
          <div class="lh-title">本机可用地址</div>
          <div v-for="(ip, i) in lanIps" :key="i" class="lh-ip">
            <span class="lh-name">{{ ip.name }}</span>
            <code>http://{{ ip.address }}:3266</code>
            <button @click="copyLan(ip.address)">复制</button>
          </div>
          <div v-if="!lanIps.length" class="lh-empty">没检测到局域网地址</div>
          <div class="lh-actions">
            <button class="lh-refresh" @click="refreshLanIps">重新检测</button>
            <button class="lh-close" @click="showLanHelp = false">关闭</button>
          </div>
        </div>
      </van-popup>'''
assert old in s
s=s.replace(old,new,1)

# 状态
s=s.replace("const localIp = ref('127.0.0.1')","const localIp = ref('127.0.0.1')\nconst lanIps = ref([])\nconst showLanHelp = ref(false)",1)

# 函数 + 初始化
s=s.replace("  localIp.value = window.electronAPI ? window.electronAPI.getLanIp() : (window.location.hostname || '127.0.0.1')","  localIp.value = window.electronAPI ? window.electronAPI.getLanIp() : (window.location.hostname || '127.0.0.1')\n  refreshLanIps()",1)

# 方法插入到 localIp 赋值附近之前？需要函数声明，任意位置
anchor = "async function openDataFolder() {"
add = '''function refreshLanIps() {
  try {
    lanIps.value = window.electronAPI?.getLanIps?.() || [{ name: '当前访问地址', address: localIp.value }]
  } catch { lanIps.value = [{ name: '当前访问地址', address: localIp.value }] }
}
function copyLan(ip) {
  const text = `http://${ip}:3266`
  navigator.clipboard?.writeText(text).then(() => showToast('已复制 ' + text)).catch(() => showToast(text))
}

'''
assert anchor in s
s=s.replace(anchor, add + anchor, 1)

# CSS
css='''
.lan-fix { border: 1px solid #d0d5dd; background: #fff; color: #1677ff; border-radius: 10px; padding: 1px 8px; font-size: 11px; cursor: pointer; margin-left: 6px; }
.lan-help { padding: 16px; }
.lan-help h4 { margin: 0 0 10px; font-size: 15px; }
.lh-steps { margin: 0 0 12px; padding-left: 20px; font-size: 12px; color: #475467; line-height: 1.8; }
.lh-title { font-size: 12px; color: #98a2b3; margin-bottom: 6px; }
.lh-ip { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px dashed #eef0f3; font-size: 12px; }
.lh-name { flex: 0 0 150px; color: #667085; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lh-ip code { flex: 1; color: #1f2937; }
.lh-ip button { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 3px 9px; font-size: 12px; cursor: pointer; }
.lh-empty { color: #98a2b3; font-size: 12px; padding: 8px 0; }
.lh-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.lh-actions button { border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.lh-refresh { color: #1677ff; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("dashboard ok")
