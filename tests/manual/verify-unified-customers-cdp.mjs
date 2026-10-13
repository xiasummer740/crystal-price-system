/**
 * 客户名统一名册 — 前端真机验证（走 CDP，真实构建产物 + 真实软件）
 *
 * 验的是「页面上真的接上了统一入口」，而不只是后端接口对：
 *   ① 记事表单：客户下拉的候选来自统一名册（含只存在于客户物料/地图的名字）
 *   ② 新增报价：客户名输入会弹出联想（这个页面从前压根没有联想）
 *   ③ 统一入口在页面里可用，且候选带各来源计数
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
if (!target) throw new Error('没有页面目标，软件是否带 --remote-debugging-port 启动？')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
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
async function goto(hash, wait = 3500) {
  const before = await evaluate('location.hash')
  await evaluate(`location.hash = ${JSON.stringify(hash)}; true`)
  // 等 hash 真的变了再等渲染（路由切换有时不是立即生效，之前这里吃过亏）
  for (let i = 0; i < 20; i++) {
    await sleep(250)
    const now = await evaluate('location.hash')
    if (now === hash && now !== before) break
  }
  await sleep(wait)
}
/** 等某个选择器出现，最多等 timeout 毫秒 */
async function waitFor(selector, timeout = 8000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return true
    await sleep(250)
  }
  return false
}

console.log('\n================ 客户名统一名册 · 前端真机验证 ================\n')

// ① 记事新增页：客户下拉候选来自统一名册
console.log('▶ ① 记事新增页 —— 客户下拉候选')
await goto('#/notes/add', 3000)
await waitFor('.van-field')
const noteForm = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const fields = [...document.querySelectorAll('.van-field')];
  const cust = fields.find(f => (f.querySelector('.van-field__label')?.textContent || '').includes('客户'));
  if (!cust) return { ok: false, why: '没找到客户输入框（当前页字段：' + fields.map(f=>(f.querySelector('.van-field__label')?.textContent||'').trim()).join('/') + '）' };
  const input = cust.querySelector('input');
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '深圳市国润聚源');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  await sleep(1500);
  const sug = document.querySelector('.customer-suggest');
  const items = sug ? [...sug.querySelectorAll('.cs-item')].map(e => e.textContent.trim()) : [];
  return { ok: items.length > 0, items: items.slice(0, 5), fieldCount: fields.length };
})()`)
check('记事页客户下拉能出候选', !!noteForm.ok,
  noteForm.ok ? JSON.stringify(noteForm.items) : `${noteForm.why || ''}（共 ${noteForm.fieldCount} 个字段）`)

// ② 新增报价页：客户名有联想（以前没有）
console.log('▶ ② 新增报价页 —— 客户名联想（原先完全没有）')
await goto('#/add', 4000)
const addRec = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const fields = [...document.querySelectorAll('.van-field')];
  const cust = fields.find(f => f.textContent.includes('初次询价客户'));
  if (!cust) return { ok: false, why: '没找到「初次询价客户」输入框' };
  const input = cust.querySelector('input');
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '深圳市');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1500);
  const sug = document.querySelector('.cust-suggest');
  const items = sug ? [...sug.querySelectorAll('.cs-item')].map(e => e.textContent.trim().replace(/\\s+/g,' ')) : [];
  return { ok: items.length > 0, items: items.slice(0, 5) };
})()`)
check('新增报价页能弹出客户联想', !!addRec.ok, addRec.ok ? JSON.stringify(addRec.items) : addRec.why)

// ③ 统一入口在页面里可用，候选带来源计数
console.log('▶ ③ 统一入口 —— 候选是否带各来源计数')
const unified = await evaluate(`(async () => {
  const r = await fetch('/api/customers/suggest?keyword=' + encodeURIComponent('深圳市国润聚源'));
  const j = await r.json();
  const first = j.data && j.data[0];
  return { count: (j.data||[]).length, first: first ? { name: first.name, material_count: first.material_count, note_count: first.note_count, map_count: first.map_count } : null };
})()`)
check('统一接口返回候选且带来源计数', unified.count > 0 && unified.first,
  unified.first ? `${unified.first.name}（物料${unified.first.material_count}/记事${unified.first.note_count}/地图${unified.first.map_count}）` : '无候选')

// ④ 客户物料页：下拉现在也能看到「没有物料」的客户（来自记事/地图）
console.log('▶ ④ 客户物料页 —— 下拉是否含「无物料」客户')
const materials = await evaluate(`(async () => {
  const r = await fetch('/api/materials/customers/list');
  const j = await r.json();
  const zero = (j.data||[]).filter(x => x.material_count === 0);
  return { total: (j.data||[]).length, zeroCount: zero.length, zeroSample: zero.slice(0,3).map(x => x.customer) };
})()`)
check('客户物料下拉包含无物料的客户（说明别处建的名字也进来了）', materials.zeroCount > 0,
  `共 ${materials.total} 个，其中无物料 ${materials.zeroCount} 个：${JSON.stringify(materials.zeroSample)}`)

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
ws.close()
process.exit(failed.length ? 1 : 0)
