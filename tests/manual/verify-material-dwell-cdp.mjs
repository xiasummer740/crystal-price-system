/**
 * 阶段停留 / 待跟进 / 看板 / 月度汇总 — 真机端到端验证（沙箱）
 *
 * 祥哥 2026-10-14 的三个诉求，一次验完：
 *   ① 列表有「停留」列（带 * = 估算）
 *   ② 待跟进面板：默认不提醒；设了阈值才列超期项（沙箱里有一条被回拨 200 天的物料）
 *   ③ 看板：按状态分列、卡片有内容
 *   ④ 月度汇总：表格 + 口径说明（必须写明历史缺口）
 *
 * 用法：seed-timeline-sandbox.mjs → DATA_DIR=沙箱 起真机 → CDP_PORT=9340 跑本脚本
 */
const PORT = Number(process.env.CDP_PORT || 9340)
const CUSTOMER = process.env.CUSTOMER || '真机验证客户甲'
const results = []
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
if (!process.env.DATA_DIR) { console.error('拒绝运行：请设置 DATA_DIR=<沙箱目录>'); process.exit(2) }

console.log('\n================ 停留 / 待跟进 / 看板 / 汇总 · 真机验证 ================\n')
let target = null
const deadline = Date.now() + 60000
while (Date.now() < deadline) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find(t => t.type === 'page' && (t.url || '').startsWith('http://localhost'))
    if (target) break
  } catch {}
  await sleep(500)
}
if (!target) throw new Error(`等不到主界面：软件是否带 --remote-debugging-port=${PORT} 启动？`)
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) }
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('页面执行出错: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
  return r.result.value
}
let ok = false
const hd = Date.now() + 45000
while (Date.now() < hd) { try { ok = await evaluate(`!!document.querySelector('#app')?.children.length`) } catch {}; if (ok) break; await sleep(500) }
check('页面已挂载', ok)

// 选中客户（后面几个视图都要基于它）
await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  location.hash = '#/materials?standalone=1';
  await sleep(2500);
  // ⚠️ 视图模式是组件状态、不进 URL：若沿用上轮跑剩的「月度汇总」视图，列表就找不到了。
  //    所以这里显式点回「列表」，让每次验证都从同一个起点开始。
  const listBtn = [...document.querySelectorAll('.view-btn')].find(b => b.textContent.trim() === '列表');
  if (listBtn) { listBtn.click(); await sleep(1500); }
  const input = document.querySelector('.customer-input');
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(CUSTOMER)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1200);
  const item = [...document.querySelectorAll('.customer-dropdown .cd-item')]
    .find(e => (e.querySelector('.cd-name')?.textContent || '').includes(${JSON.stringify(CUSTOMER)}));
  if (item) item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(2500);
  return true;
})()`)

// ① 列表「停留」列
const dwellCol = await evaluate(`(() => {
  const ths = [...document.querySelectorAll('th.col-th')].map(t => t.textContent.replace(/[▲▼]/g, '').trim());
  const tags = [...document.querySelectorAll('.col-dwell .dwell-tag')].map(e => e.textContent.trim());
  return { hasCol: ths.includes('停留'), tags, sample: tags[0] || '' };
})()`)
check('列表里有「停留」列', dwellCol.hasCol, JSON.stringify(dwellCol.tags.slice(0, 4)))
check('停留列显示 200 天那条（精确口径，无 *）', dwellCol.tags.some(t => /^200 天$/.test(t)), JSON.stringify(dwellCol.tags))
check('估算口径带 * 标记（界面能区分两种口径）', dwellCol.tags.some(t => /\*$/.test(t)), JSON.stringify(dwellCol.tags.slice(0, 3)))

// ② 待跟进：**先复位设置**再验（设置是持久化的，上一轮跑过就会留着，否则「默认不提醒」这条永远测不到）
// ⚠️ 写接口要带 x-auth-token（页面里的 axios 拦截器会自动带，裸 fetch **不会** —— 实测返回 401，
//    复位静默失败，结果就是「默认不提醒」这条永远测不过）。这里先取 token 再发。
await evaluate(`(async () => {
  let token = localStorage.getItem('crystal_auth_token');
  if (!token) { const t = await (await fetch('/api/auth/token')).json(); token = t.data?.token; if (token) localStorage.setItem('crystal_auth_token', token); }
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token || '' },
    body: JSON.stringify({ material_stale: JSON.stringify({ enabled: false, thresholds: {} }) })
  });
  return res.status;
})()`)
await sleep(600)
const staleFlow = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('待跟进'));
  if (!btn) return { ok: false, why: '没有待跟进按钮' };
  btn.click();
  await sleep(2000);
  const panel = document.querySelector('.st');
  if (!panel) return { ok: false, why: '面板没打开' };
  const before = { enabled: !!document.querySelector('.st-switch input')?.checked, empty: !!document.querySelector('.st-empty'), text: (document.querySelector('.st-empty')?.innerText || '').slice(0, 40) };
  // 勾上开关、把「报价」阈值设成 30，保存
  const sw = document.querySelector('.st-switch input');
  if (!sw.checked) { sw.click(); await sleep(300); }
  const inputs = [...document.querySelectorAll('.st-th-input')];
  const names = [...document.querySelectorAll('.st-th-name')].map(e => e.textContent.trim());
  const idx = names.indexOf('报价');
  if (idx >= 0) {
    const el = inputs[idx];
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, '30');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
  }
  const saveBtn = [...document.querySelectorAll('.st-btn')].find(b => b.textContent.includes('保存'));
  saveBtn.click();
  await sleep(2500);
  const rows = [...document.querySelectorAll('.st-row')].map(r => r.innerText.replace(/\\s+/g, ' ').trim());
  return { ok: true, before, names, rows };
})()`)
check('待跟进面板能打开且默认不提醒', staleFlow.ok && staleFlow.before.enabled === false, staleFlow.before?.text || staleFlow.why)
check('阈值输入按状态逐项（来自服务端状态清单）', (staleFlow.names || []).includes('报价') && (staleFlow.names || []).includes('下批量'), JSON.stringify(staleFlow.names))
check('设了阈值后列出超期物料（200 天那条）', (staleFlow.rows || []).some(t => /200\s*天/.test(t)), JSON.stringify((staleFlow.rows || []).slice(0, 2)))
check('两种口径都能出现：既要有「估算」，也要有「精确」', (staleFlow.rows || []).some(t => t.includes('估算')) && (staleFlow.rows || []).some(t => t.includes('精确')),
  `估算 ${(staleFlow.rows || []).filter(t => t.includes('估算')).length} 条 / 精确 ${(staleFlow.rows || []).filter(t => t.includes('精确')).length} 条`)
// 收尾：关掉面板
await evaluate(`document.querySelector('.st-close')?.click(); true`)

// ③ 看板
const kanban = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('.view-btn')].find(b => b.textContent.trim() === '看板');
  btn.click();
  await sleep(2800);
  const cols = [...document.querySelectorAll('.mkb-col-name')].map(e => e.textContent.trim());
  const cards = document.querySelectorAll('.mkb-card').length;
  const sample = (document.querySelector('.mkb-card')?.innerText || '').replace(/\\s+/g, ' ').trim();
  return { cols, cards, sample };
})()`)
console.log('  看板列：', JSON.stringify(kanban.cols), ' 卡片数：', kanban.cards)
check('看板按状态分列（5 个状态来自服务端清单）', kanban.cols.length >= 4 && kanban.cols.includes('报价'), JSON.stringify(kanban.cols))
check('看板卡片有内容（客户/料号/停留）', kanban.cards > 0 && /天/.test(kanban.sample), kanban.sample.slice(0, 80))

// ④ 月度汇总
const monthly = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('.view-btn')].find(b => b.textContent.trim() === '月度汇总');
  btn.click();
  await sleep(2800);
  const heads = [...document.querySelectorAll('.mm-tbl th')].map(e => e.textContent.trim());
  const notes = [...document.querySelectorAll('.mm-note')].map(e => e.textContent.trim());
  const rows = document.querySelectorAll('.mm-tbl tbody tr').length;
  return { heads, notes, rows };
})()`)
console.log('  汇总表头：', JSON.stringify(monthly.heads))
check('汇总表头含 报价/改价/状态推进/下单量/备货量', ['报价', '改价', '状态推进', '下单量', '备货量'].every(h => monthly.heads.includes(h)), JSON.stringify(monthly.heads))
check('汇总写明了口径说明', (monthly.notes || []).length >= 4, `${(monthly.notes || []).length} 条说明`)
check('口径说明点出「自 2026-10-14 起才有」的历史缺口', (monthly.notes || []).some(t => t.includes('2026-10-14')), '')
check('汇总有数据行（沙箱本月有报价/送样）', monthly.rows > 0, `${monthly.rows} 行`)

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
ws.close()
process.exit(failed.length ? 1 : 0)
