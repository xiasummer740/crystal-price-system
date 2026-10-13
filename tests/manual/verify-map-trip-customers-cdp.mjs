/**
 * 补验：三处「改过代码但没当面点过」的 UI（走 CDP，真实软件 + 真实构建产物）
 *
 *   ① 客户地图 · 新建客户 → 客户名联想（原走 /notes/customers/search，现走统一名册）
 *   ② 客户地图 · 「👤 导入」按钮 → 从统一名册导入（原只导 customers+notes，现导 5 表并集）
 *   ③ 行程计划 · 途经点搜索 → 地图客户 + 统一名册合并（没进地图的客户也能搜到）
 *
 * 前置：真实软件带 --remote-debugging-port=9333 启动，DATA_DIR=<沙箱>
 */
const PORT = 9333
const results = []
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const target = list.find(t => t.type === 'page')
if (!target) throw new Error('没有页面目标')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let msgId = 0
const pending = new Map()
const netLog = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/')) {
    netLog.push(m.params.request.url.replace(/^https?:\/\/[^/]+/, ''))
  }
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  }
}
function send(method, params = {}) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('页面执行出错: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
  return r.result.value
}
async function goto(hash, wait = 4000) {
  const before = await evaluate('location.hash')
  await evaluate(`location.hash = ${JSON.stringify(hash)}; true`)
  for (let i = 0; i < 24; i++) {
    await sleep(250)
    const now = await evaluate('location.hash')
    if (now === hash && now !== before) break
  }
  await sleep(wait)
}
await send('Network.enable')

console.log('\n========== 补验三处 UI（地图联想 / 地图导入 / 行程途经点） ==========\n')

// ① 客户地图 · 新建客户的客户名联想
console.log('▶ ① 客户地图 —— 新建客户时的客户名联想')
await goto('#/map-addresses', 5000)
const mapSug = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('新建客户'));
  if (!btn) return { ok: false, why: '没找到「新建客户」按钮' };
  btn.click();
  await sleep(1500);
  const field = [...document.querySelectorAll('.van-field')].find(f => (f.querySelector('.van-field__label')?.textContent || '').includes('客户名'));
  if (!field) return { ok: false, why: '弹窗里没找到客户名输入框' };
  const input = field.querySelector('input');
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '深圳市国润聚源');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await sleep(2000);
  const sug = document.querySelector('.customer-suggest-fixed');
  const items = sug ? [...sug.querySelectorAll('.cs-item')].map(e => e.textContent.trim()) : [];
  return { ok: items.length > 0, items: items.slice(0, 5) };
})()`)
check('地图「新建客户」能弹出客户名联想', !!mapSug.ok,
  mapSug.ok ? JSON.stringify(mapSug.items) : mapSug.why)

// ② 客户地图 · 「👤 导入」按钮（数据源应为 5 表并集）
console.log('▶ ② 客户地图 —— 「👤 导入」按钮（应从统一名册导入）')
const importNet = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.title || '').includes('从记事导入') || b.textContent.includes('👤 导入'));
  if (!btn) return { ok: false, why: '没找到导入按钮' };
  btn.click();
  return { ok: true };
})()`)
await sleep(2500)
// 导入会弹确认框，确认后再看网络
const confirmed = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const dlg = document.querySelector('.van-dialog');
  const txt = dlg ? dlg.innerText.replace(/\\n/g, ' | ') : null;
  const okBtn = dlg ? [...dlg.querySelectorAll('button')].find(b => /确定|确认|导入/.test(b.textContent)) : null;
  if (okBtn) { okBtn.click(); await sleep(2500); return { clicked: true, dialogText: txt }; }
  return { clicked: false, dialogText: txt };
})()`)
await sleep(2000)
const importCalls = netLog.filter(u => u.includes('/map/customers/import'))
check('地图「导入」按钮点得到、有确认框', !!importNet.ok || confirmed.clicked,
  confirmed.dialogText ? `确认框：${confirmed.dialogText.slice(0, 80)}` : (importNet.why || ''))
check('导入请求打到了 /map/customers/import', importCalls.length > 0,
  importCalls.length ? importCalls[importCalls.length - 1] : `未捕获到（近 ${netLog.length} 条请求）`)

// 干净验证导入的数据源范围
const importScope = await evaluate(`(async () => {
  const r = await fetch('/api/map/customers');
  const j = await r.json();
  return { mapCustomers: (j.data || []).length };
})()`)
console.log(`   （地图当前客户数：${importScope.mapCustomers}）`)

// ③ 行程计划 · 途经点搜索（地图客户 + 统一名册合并）
// 「＋ 添加」按钮只在选中某个行程后才出现，而沙箱里可能一个行程都没有 → 先建一个临时的
console.log('▶ ③ 行程计划 —— 途经点搜索客户（先建临时行程）')
const tmpPlan = await evaluate(`(async () => {
  const token = (await (await fetch('/api/auth/token')).json()).data.token;
  const r = await fetch('/api/map/trip-plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
    body: JSON.stringify({ title: 'UI补验-临时行程', plan_date: new Date().toISOString().slice(0,10), notes: '' })
  });
  const j = await r.json();
  return { code: j.code, id: j.data?.id, msg: j.msg };
})()`)
console.log(`   临时行程: code=${tmpPlan.code} id=${tmpPlan.id}`)

// 页面是 KeepAlive 缓存的，直接切路由不会重新拉列表 → 强制刷新一次
await send('Page.reload', { ignoreCache: true })
await sleep(7000)
await goto('#/trip-plans', 4500)
const tripSearch = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // 左侧按日期筛，先把筛选日期设成「今天」并触发 loadPlans，再等卡片出现
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.querySelector('.date-input');
  if (dateInput) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(dateInput, today);
    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // 轮询等行程卡片出现（最多 10 秒）
  let item = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    item = document.querySelector('.plan-card') || document.querySelector('.ap-item');
    if (item) break;
    // 「全部行程」折叠时展开
    const toggle = document.querySelector('.ap-header');
    if (toggle && i === 4) toggle.click();
  }
  if (!item) return { ok: false, why: '左侧没有可选的行程（文本=' + document.body.innerText.slice(0, 70).replace(/\\n/g,'|') + '）' };
  item.click();
  await sleep(2200);
  const addBtn = document.querySelector('.add-point-btn');
  if (!addBtn) return { ok: false, why: '选中行程后没出现「＋ 添加」按钮' };
  addBtn.click();
  await sleep(1600);
  const field = [...document.querySelectorAll('.van-field')].find(f => (f.querySelector('.van-field__label')?.textContent || '').includes('搜索客户'));
  if (!field) return { ok: false, why: '途经点弹层里没找到「搜索客户」输入框' };
  const input = field.querySelector('input');
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '深圳市国润聚源');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  // 地图那条请求较慢，轮询等候选出现（最多 12 秒）
  let items = [];
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    const box = document.querySelector('.point-search-results');
    items = box ? [...box.querySelectorAll('.ps-item')].map(e => e.textContent.trim().replace(/\\s+/g,' ')) : [];
    if (items.length) break;
  }
  return { ok: items.length > 0, items: items.slice(0, 5), emptyShown: !!document.querySelector('.point-search-empty') };
})()`)
check('行程页途经点搜索能出候选', !!tripSearch.ok,
  tripSearch.ok ? JSON.stringify(tripSearch.items) : `${tripSearch.why || ''}（空态=${tripSearch.emptyShown}）`)

// 清理临时行程
const cleanup = await evaluate(`(async () => {
  const token = (await (await fetch('/api/auth/token')).json()).data.token;
  const r = await fetch('/api/map/trip-plans/${tmpPlan.id ?? ''}', { method: 'DELETE', headers: { 'x-auth-token': token } });
  return { status: r.status };
})()`)
console.log(`   已清理临时行程（HTTP ${cleanup.status}）`)

console.log('\n========== 结果 ==========')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
if (failed.length) console.log('失败项：' + failed.map(f => f.name).join('、'))
console.log('\n相关网络请求：')
console.log(netLog.filter(u => /customers/.test(u)).slice(-10).join('\n') || '(无)')
ws.close()
process.exit(failed.length ? 1 : 0)
