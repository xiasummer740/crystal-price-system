p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()
css = '''
@media (max-width: 768px) {
  .coverage-card { margin: 6px 8px 2px; padding: 6px; }
  .cv-item { min-width: 48px; margin-right: 4px; }
  .cv-item b { font-size: 13px; }
  .cv-item span { font-size: 9px; }
  .cv-top { font-size: 10px; }
  .sort-row { padding: 2px 8px; }
  .sort-select { font-size: 11px; }
  .cc-actions button { font-size: 10px; padding: 2px 6px; }
  .nearby-wrap { padding: 12px; }
  .nearby-name { font-size: 12px; }
}
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
