p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()
css = '''
/* ===== 2026-10-29 体验优化 ===== */
.sort-row { display: flex; align-items: center; gap: 8px; padding: 4px 10px 2px; }
.sort-label { font-size: 12px; color: #98a2b3; }
.sort-select { flex: 1; border: 1px solid #e4e7ec; border-radius: 6px; padding: 4px 8px; font-size: 12px; color: #344054; background: #fff; outline: none; }
.sort-select:focus { border-color: var(--color-primary, #1677ff); }
.cc-badge.warn { background: #fff7e6; color: #ad6800; }
.cc-site { font-size: 11px; color: #667085; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.customer-card { border-left: 3px solid transparent; transition: background .15s, border-color .15s; }
.customer-card:hover { background: #fafcff; }
.customer-card.active { border-left-color: var(--color-primary, #1677ff); background: #f2f7ff; }
.cc-actions button { font-size: 11px; }
.addr-history { margin: 10px 0 2px; border-top: 1px dashed #eef0f3; padding-top: 8px; }
.ah-title { font-size: 12px; color: #667085; margin-bottom: 4px; }
.ah-row { display: flex; gap: 8px; font-size: 11px; color: #98a2b3; padding: 2px 0; }
.ah-time { flex: 0 0 72px; }
.ah-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
'''
idx = s.rfind("</style>")
s = s[:idx] + css + "\n" + s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
