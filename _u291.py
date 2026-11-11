p="PROGRESS.md"
s=open(p,encoding="utf-8").read()
s=s.replace("> 最后更新: 2026-11-11 | 当前版本: **v1.0.290（✅ 已发版）**","> 最后更新: 2026-11-11 | 当前版本: **v1.0.291（✅ 已发版）**",1)
s=s.replace("| 1.0.290 | 升级下载改 6 路分段并行，实测约 1.1MB/s |","| 1.0.290 | 升级下载改 6 路分段并行，实测约 1.1MB/s |\n| 1.0.291 | 客户物料页加「切换客户」按钮 |",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
