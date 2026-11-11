import json, re
p="PROGRESS.md"
s=open(p,encoding="utf-8").read()
s=s.replace("> 最后更新: 2026-11-11 | 当前版本: **v1.0.289（✅ 已发版）**","> 最后更新: 2026-11-11 | 当前版本: **v1.0.290（✅ 已发版）**",1)
s=s.replace("| 1.0.289 | 客户多抬头：订单可选抬头并自动填乙方信息 |","| 1.0.289 | 客户多抬头：订单可选抬头并自动填乙方信息 |\n| 1.0.290 | 升级下载改 6 路分段并行，实测约 1.1MB/s |",1)
open(p,"w",encoding="utf-8",newline="").write(s)

p2="docs/踩坑记录.md"
t=open(p2,encoding="utf-8").read()
add='''**补充（v1.0.290，2026-11-11）**
- 走系统代理后单连接仍只有 ~90KB/s；实测 6 路独立 session 分段并行约 **1.1MB/s**（12 倍）。
- 原因：GitHub/代理对单连接限速，多连接可叠加。
- 实现：大文件（>20MB）用 `session.fromPartition('crystal-update-N')` 各自 `fetch` 一个 Range 分片，`writeSync(fd, buf, ..., pos)` 写同一文件；失败回退单线程。
- 注意：同一个 session 的多个 fetch 会被 Chromium 串行/限速，必须用**不同 session**。

'''
t=t.replace("**备注**\n- 如果用户机器没开代理/VPN，走 net 也快不了，这是网络本身的问题，不是程序。","**备注**\n- 如果用户机器没开代理/VPN，走 net 也快不了，这是网络本身的问题，不是程序。\n\n"+add,1)
open(p2,"w",encoding="utf-8",newline="").write(t)
print("ok")
