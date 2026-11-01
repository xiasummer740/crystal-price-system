p="client/src/views/Dashboard.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''｜ <button class="lan-fix" @click="openTunnel">隧道状态</button>
        <button class="lan-fix" @click="showLanHelp = true; refreshLanIps()">打不开？</button>''','''｜ <button class="lan-fix" @click="openTunnel">隧道状态</button>
        <span class="lan-sep">·</span>
        <button class="lan-fix" @click="showLanHelp = true; refreshLanIps()">打不开？</button>''',1)
s=s.replace(".lan-fix { border:", ".lan-sep { color: #d0d5dd; margin: 0 2px; }\n.lan-fix { border:",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
