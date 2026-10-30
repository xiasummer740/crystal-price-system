p="client/src/views/Dashboard.vue"
s=open(p,encoding="utf-8").read()

# 顶部提示补一句外网
s=s.replace('''手机端访问：同一 WiFi，浏览器访问 <strong>http://{{ localIp }}:3266</strong>''','''手机端访问：同一 WiFi 用 <strong>http://{{ localIp }}:3266</strong>；人在外面用 Tailscale（点「打不开？」）''',1)

# 弹层里加「外网访问」段
old='''          <div class="lh-title">本机可用地址</div>'''
new='''          <div class="lh-title">人在外面 / 用手机流量</div>
          <div class="lh-wan">
            <p>局域网地址只能同一 WiFi 用。手机用流量时，推荐装 <b>Tailscale</b>（免费、加密、不用开公网端口）：</p>
            <ol class="lh-steps">
              <li>电脑装 Tailscale 并登录（tailscale.com/download）</li>
              <li>手机装 Tailscale，登录同一个账号</li>
              <li>手机浏览器访问下面检测到的 100.x 地址</li>
            </ol>
            <div v-if="tailscaleIp" class="lh-ip">
              <span class="lh-name">Tailscale</span>
              <code>http://{{ tailscaleIp }}:3266</code>
              <button @click="copyLan(tailscaleIp)">复制</button>
            </div>
            <div v-else class="lh-empty">未检测到 Tailscale 地址（100.x）。装好并登录后点「重新检测」。</div>
          </div>

          <div class="lh-title">本机可用地址</div>'''
assert old in s
s=s.replace(old,new,1)

# computed
s=s.replace("const lanIps = ref([])","const lanIps = ref([])\nconst tailscaleIp = computed(() => lanIps.value.find(x => /^100\\./.test(x.address))?.address || '')",1)

# CSS
css='''
.lh-wan { background: #f6fffb; border: 1px solid #b7ebd6; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
.lh-wan p { margin: 0 0 6px; font-size: 12px; color: #344054; }
.lh-wan .lh-steps { margin: 0 0 8px; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
