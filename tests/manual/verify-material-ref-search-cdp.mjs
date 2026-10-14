/**
 * 「记事里的关联物料能按关键字筛选」— 真机验证（沙箱）
 *
 * 背景：祥哥 2026-10-14 反馈「记事里面的选择物料，只能手动选择吗？不能关键字筛选快捷选择吗」。
 * 原来是原生下拉，客户物料几十上百条时只能一条条翻。改成**输入即筛选**（和客户选择器同一套交互）。
 *
 * 要证的三件事：
 *   ① 打字能筛出匹配项，且**不相关的被挡掉**（用两条对照物料）
 *   ② 料号/编码也能筛（不只按名称）
 *   ③ 选中后保存，关联真的落库（记事详情能看到动作+数量）
 *
 * 用法：seed-timeline-sandbox.mjs 先塞数据 → DATA_DIR=沙箱 起真机 → CDP_PORT=9339 跑本脚本
 */
const PORT = Number(process.env.CDP_PORT || 9339)
const CUSTOMER = process.env.CUSTOMER || '真机验证客户甲'
const results = []
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
if (!process.env.DATA_DIR) { console.error('拒绝运行：请设置 DATA_DIR=<沙箱目录>'); process.exit(2) }

console.log('\n================ 关联物料「输入即筛选」· 真机验证 ================\n')
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

// 打开新增记事 + 选客户 + 添加一行物料
const setup = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  location.hash = '#/notes/add';
  await sleep(2600);
  const setV = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const inputs = [...document.querySelectorAll('input, textarea')];
  const title = inputs.find(i => (i.placeholder || '').includes('记事标题'));
  if (title) setV(title, '真机验证-筛选选料');
  const cust = inputs.find(i => (i.placeholder || '').includes('关联客户'));
  if (!cust) return { ok: false, why: '没有客户输入框' };
  setV(cust, ${JSON.stringify(CUSTOMER)});
  cust.dispatchEvent(new Event('blur', { bubbles: true }));
  await sleep(2600);
  const addBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('添加物料'));
  if (!addBtn) return { ok: false, why: '没有「添加物料」按钮' };
  addBtn.click();
  await sleep(800);
  const optCount = document.querySelectorAll('.mrp-opt').length;
  return { ok: !!document.querySelector('.mrp-input'), optCount };
})()`)
check('记事表单里有可输入的物料选择框', setup.ok, setup.ok ? `初始候选 ${setup.optCount} 条` : setup.why)
if (!setup.ok) { ws.close(); process.exit(1) }

// 打字筛选：按名称片段
const byName = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const el = document.querySelector('.mrp-input');
  const setV = (v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  el.focus();
  setV('27.120');
  await sleep(600);
  return { opts: [...document.querySelectorAll('.mrp-opt')].map(e => e.innerText.replace(/\\s+/g, ' ').trim()) };
})()`)
console.log('  按「27.120」筛出：', JSON.stringify(byName.opts))
check('按名称片段能筛出匹配物料', byName.opts.some(t => t.includes('27.120')), `${byName.opts.length} 条`)
check('不相关的物料被挡掉（3225/40.000 那条不在）', !byName.opts.some(t => t.includes('40.000MHz')), '')

// 打字筛选：按料号（TL-VERIFY-002）
const byCode = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const el = document.querySelector('.mrp-input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, 'TL-VERIFY-002');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(600);
  return { opts: [...document.querySelectorAll('.mrp-opt')].map(e => e.innerText.replace(/\\s+/g, ' ').trim()) };
})()`)
console.log('  按「TL-VERIFY-002」筛出：', JSON.stringify(byCode.opts))
check('按晶科鑫料号也能筛', byCode.opts.length === 1 && byCode.opts[0].includes('TL-VERIFY-002'), '')
check('按料号筛时另一条物料不在', !byCode.opts.some(t => t.includes('TL-VERIFY-001')), '')

// 点选 + 填动作/数量 + 保存
const saved = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const opt = document.querySelector('.mrp-opt');
  opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(500);
  const picked = document.querySelector('.mrp-input');
  const pickedText = picked.value;
  const isPicked = picked.classList.contains('picked');
  const dropGone = !document.querySelector('.mrp-drop');
  // 动作 + 数量
  const asel = [...document.querySelectorAll('.mrp-row select')][0];
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(asel, '备货');
  asel.dispatchEvent(new Event('change', { bubbles: true }));
  const qty = document.querySelector('.mrp-qty');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(qty, '3000');
  qty.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500);
  const saveBtn = [...document.querySelectorAll('button')].find(b => /保存/.test(b.textContent) && b.offsetParent);
  saveBtn.click();
  await sleep(3000);
  return { pickedText, isPicked, dropGone };
})()`)
check('点选后输入框显示该物料（并进入已选状态）', saved.isPicked && saved.pickedText.length > 0, saved.pickedText)
check('选完下拉自动收起', saved.dropGone, '')

// 落库核对：记事详情里应显示 备货 3000
const landed = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const r = await (await fetch('/api/notes?keyword=' + encodeURIComponent('真机验证-筛选选料'))).json();
  const note = (r.data?.list || []).find(n => n.title === '真机验证-筛选选料');
  if (!note) return { ok: false, why: '找不到刚建的记事' };
  location.hash = '#/notes/' + note.id;
  await sleep(2500);
  const box = document.querySelector('.mat-refs');
  return { ok: !!box, text: box ? box.innerText.replace(/\\s+/g, ' ').trim() : '', refs: note.material_refs };
})()`)
check('筛选选中的物料真的落库了', landed.ok && /备货/.test(landed.text) && /3000/.test(landed.text), landed.ok ? landed.text.slice(0, 140) : landed.why)
check('落库的名字是所选的 3225 那条（不是默认第一条）', (landed.refs?.[0]?.name || '').includes('3225'), JSON.stringify(landed.refs?.[0]?.name || ''))

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
ws.close()
process.exit(failed.length ? 1 : 0)
