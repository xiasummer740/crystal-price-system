/**
 * 物料进展时间线 + 记事关联物料 — 真机端到端验证（沙箱）
 *
 * 为什么必须真机：这是「页面 → api → 聚合 → 页面」的完整链路，
 * 而且失败形态是**静默**的（时间线空着、或关联了却不显示）。
 *
 * 覆盖：
 *   ① 客户物料页 → 选中客户 → 点该行 ⏱ → 时间线打开，能看到 报价 / 送样 / 建档
 *   ② 通过**编辑弹窗**把状态改成「规格书」→ 再开时间线 → 出现「状态：报价 → 规格书」
 *   ③ 新增记事时**关联该物料**（下单 5000）→ 再开时间线 → 出现「下单 5000」
 *   ④ **没关联**的那条记事不出现在物料进展里
 *   ⑤ 记事详情页把关联物料显示出来（动作+数量）
 *
 * 用法：先 seed-timeline-sandbox.mjs，再 DATA_DIR=沙箱 起真机并开 CDP 端口
 *       $env:CDP_PORT=9338; node tests\manual\verify-material-timeline-cdp.mjs
 */
const PORT = Number(process.env.CDP_PORT || 9338)
const CUSTOMER = process.env.CUSTOMER || '真机验证客户甲'
const JKX = process.env.JKX || 'TL-VERIFY-001'
const results = []
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
if (!process.env.DATA_DIR) { console.error('拒绝运行：请设置 DATA_DIR=<沙箱目录>'); process.exit(2) }

console.log('\n================ 物料进展 + 记事关联 · 真机验证 ================\n')

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

// ===== ① 选中客户 → 打开该行的时间线 =====
const opened = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  location.hash = '#/materials?standalone=1';
  await sleep(2500);
  // 选中客户（客户选择器是输入框 + 回车确认）
  const input = document.querySelector('.customer-input');
  if (!input) return { ok: false, why: '没有客户选择框' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(CUSTOMER)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1200);
  const item = [...document.querySelectorAll('.customer-dropdown .cd-item')]
    .find(e => (e.querySelector('.cd-name')?.textContent || '').includes(${JSON.stringify(CUSTOMER)}));
  if (!item) return { ok: false, why: '下拉里没有这个客户' };
  item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(2500);
  const rows = [...document.querySelectorAll('tbody tr')];
  const row = rows.find(tr => tr.innerText.includes(${JSON.stringify(JKX)}) || tr.innerText.includes('真机验证物料'));
  if (!row) return { ok: false, why: '表格里没找到该物料行', rows: rows.length };
  const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '⏱');
  if (!btn) return { ok: false, why: '该行没有进展按钮（⏱）' };
  btn.click();
  await sleep(2200);
  const dlg = document.querySelector('.mtl');
  return { ok: !!dlg, text: dlg ? dlg.innerText.replace(/\\s+/g, ' ').trim() : '' };
})()`)
check('客户物料页能打开某物料的「进展」时间线', opened.ok, opened.ok ? '' : opened.why)
if (!opened.ok) { console.log('  页面文本：', (opened.text || '').slice(0, 200)); ws.close(); process.exit(1) }
check('时间线里能看到报价记录（0.452）', /报价/.test(opened.text) && /0\.452/.test(opened.text), opened.text.slice(0, 120))
check('时间线里能看到送样（送样登记）', /送样/.test(opened.text), '')
check('时间线里能看到建档', /建档/.test(opened.text), '')
check('无关记事**没有**出现在时间线里', !opened.text.includes('无关记事'), '')

// ===== ② 用编辑弹窗改状态 → 时间线出现状态流转 =====
const afterStatus = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // 关掉时间线
  const close = document.querySelector('.mtl-close');
  if (close) close.click();
  await sleep(800);
  const rows = [...document.querySelectorAll('tbody tr')];
  const row = rows.find(tr => tr.innerText.includes(${JSON.stringify(JKX)}) || tr.innerText.includes('真机验证物料'));
  const editBtn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '✎');
  editBtn.click();
  await sleep(1800);
  // 状态控件是自定义的 .status-select（点开 van-action-sheet），不是 van-field
  const st = document.querySelector('.status-select');
  if (!st) return { ok: false, why: '编辑弹窗里没有 .status-select' };
  st.click();
  await sleep(1000);
  const act = [...document.querySelectorAll('.van-action-sheet__item, .van-action-sheet .van-cell, .van-action-sheet .van-action-sheet__item')]
    .find(e => e.textContent.trim() === '规格书');
  if (!act) return { ok: false, why: '动作面板里没有「规格书」', sheet: document.querySelector('.van-action-sheet')?.innerText?.replace(/\s+/g, ' ').slice(0, 120) };
  act.click();
  await sleep(900);
  const saveBtn = document.querySelector('.form-save');
  if (!saveBtn) return { ok: false, why: '没找到 .form-save 保存按钮' };
  saveBtn.click();
  await sleep(2500);
  // 再开时间线
  const rows2 = [...document.querySelectorAll('tbody tr')];
  const row2 = rows2.find(tr => tr.innerText.includes(${JSON.stringify(JKX)}) || tr.innerText.includes('真机验证物料'));
  const tl = [...row2.querySelectorAll('button')].find(b => b.textContent.trim() === '⏱');
  tl.click();
  await sleep(2200);
  const dlg = document.querySelector('.mtl');
  return { ok: !!dlg, text: dlg ? dlg.innerText.replace(/\\s+/g, ' ').trim() : '' };
})()`)
check('改状态后时间线出现「状态：报价 → 规格书」', /状态：报价\s*→\s*规格书/.test(afterStatus.text), (afterStatus.text || '').slice(0, 160))
if (!afterStatus.ok) check('（步骤②整体）', false, afterStatus.why || '时间线没打开')

// ===== ③ 新增记事并关联该物料（下单 5000）=====
const linked = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  location.hash = '#/notes/add';
  await sleep(2500);
  const inputs = [...document.querySelectorAll('input, textarea')];
  const setV = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  // 标题
  const title = inputs.find(i => (i.placeholder || '').includes('记事标题'));
  if (title) setV(title, '真机验证-关联记事');
  // 客户（记事表单的客户输入框）
  const cust = inputs.find(i => (i.placeholder || '').includes('关联客户'));
  if (!cust) return { ok: false, why: '记事表单没有客户输入框' };
  setV(cust, ${JSON.stringify(CUSTOMER)});
  cust.dispatchEvent(new Event('blur', { bubbles: true }));
  await sleep(2500);
  // 关联物料：先点「添加物料」，再在下拉里选
  const addBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('添加物料'));
  if (!addBtn) return { ok: false, why: '没有「添加物料」按钮（关联物料块没渲染）' };
  addBtn.click();
  await sleep(600);
  const msel = document.querySelector('.mrp-row select');
  if (!msel) return { ok: false, why: '添加后没有物料下拉' };
  const opt = [...msel.options].find(o => (o.textContent || '').includes('真机验证物料'));
  if (!opt) return { ok: false, why: '物料下拉里没有该客户的物料', opts: [...msel.options].map(o => o.textContent).slice(0, 5) };
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(msel, opt.value);
  msel.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(800);
  // 动作 + 数量
  const acts = [...document.querySelectorAll('.mrp-row select')];
  const asel = acts[1];
  if (asel) { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(asel, '下单'); asel.dispatchEvent(new Event('change', { bubbles: true })); }
  const qty = document.querySelector('.mrp-row .mrp-qty');
  if (qty) setV(qty, '5000');
  await sleep(400);
  // 保存
  const saveBtn = [...document.querySelectorAll('button')].find(b => /保存/.test(b.textContent) && b.offsetParent);
  if (!saveBtn) return { ok: false, why: '记事表单没找到保存按钮' };
  saveBtn.click();
  await sleep(3000);
  return { ok: true, hash: location.hash };
})()`)
check('记事表单能提交「关联物料 + 动作 + 数量」', linked.ok, linked.ok ? `回到 ${linked.hash}` : linked.why)

// ===== ④ 关联后：物料进展里出现这条记事；无关记事仍然不进 =====
const finalTl = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  location.hash = '#/materials?standalone=1';
  await sleep(2500);
  const input = document.querySelector('.customer-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(CUSTOMER)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1200);
  const item = [...document.querySelectorAll('.customer-dropdown .cd-item')]
    .find(e => (e.querySelector('.cd-name')?.textContent || '').includes(${JSON.stringify(CUSTOMER)}));
  item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(2500);
  const row = [...document.querySelectorAll('tbody tr')].find(tr => tr.innerText.includes('真机验证物料'));
  const tl = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '⏱');
  tl.click();
  await sleep(2400);
  const dlg = document.querySelector('.mtl');
  return { text: dlg ? dlg.innerText.replace(/\\s+/g, ' ').trim() : '' };
})()`)
check('时间线里出现被关联的记事（下单 5000）', /下单\s*5000/.test(finalTl.text), (finalTl.text || '').slice(0, 200))
check('关联记事带「记事」来源标签', /记事/.test(finalTl.text), '')
check('无关记事**始终**不进物料进展', !finalTl.text.includes('无关记事'), '')

// ===== ⑤ 记事详情页显示关联物料 =====
const detail = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const r = await (await fetch('/api/notes?keyword=' + encodeURIComponent('真机验证-关联记事'))).json();
  const note = (r.data?.list || []).find(n => n.title === '真机验证-关联记事');
  if (!note) return { ok: false, why: '找不到刚建的记事' };
  location.hash = '#/notes/' + note.id;
  await sleep(2500);
  const box = document.querySelector('.mat-refs');
  return { ok: !!box, text: box ? box.innerText.replace(/\\s+/g, ' ').trim() : '' };
})()`)
check('记事详情页显示「关联物料」（动作+数量）', detail.ok && /下单/.test(detail.text) && /5000/.test(detail.text), detail.ok ? detail.text.slice(0, 120) : detail.why)

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
ws.close()
process.exit(failed.length ? 1 : 0)
