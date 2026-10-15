/**
 * 客户账期 / 对账付款 / 备注 —— 真机端到端验证（沙箱）
 *
 * 祥哥 2026-10-15 需求：在「客户物料」页头选中客户那一行显示账期、对账付款时间、备注；
 * 口径「两者都要」= 结构化（每月对账日 + 账期天数，自动滚动）+ 手填具体日期（**优先**）。
 *
 * 验的点：
 *   ① 没填时显示「未设置账期 ✎ 点击填写」
 *   ② 点它 → 编辑面板 → 填「月结30天 / 每月5号 / 对账后30天 / 备注」→ 保存
 *   ③ 页头立刻显示账期 + 自动算出的下次对账日（今天 10-15，每月 5 号 ⇒ 11-05，剩 21 天）+ 应付日
 *   ④ 手填「下次对账日 = 2026-10-01」⇒ **优先**，且明确提示「手动指定，已过期，请更新」（红）
 *   ⑤ 名册管理里能看到账期 + 下次对账日，且**删除按钮被禁用**（填过资料不许删）
 *   ⑥ 落库正确（直接查接口核对原文，不是只看界面）
 */
const PORT = Number(process.env.CDP_PORT || 9342)
const CUSTOMER = process.env.CUSTOMER || '真机验证客户甲'
const results = []
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
if (!process.env.DATA_DIR) { console.error('拒绝运行：请设置 DATA_DIR=<沙箱目录>'); process.exit(2) }

console.log('\n================ 客户账期 / 对账付款 · 真机验证 ================\n')
let target = null
for (let i = 0; i < 80 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find(t => t.type === 'page' && (t.url || '').startsWith('http://localhost'))
  } catch {}
  if (!target) await sleep(500)
}
if (!target) throw new Error(`等不到主界面：是否带 --remote-debugging-port=${PORT} 启动？`)
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) }
}
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('页面执行出错: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
  return r.result.value
}
// SPA 路由跳转会销毁执行上下文 ⇒ 分开 evaluate + 重试
const safe = async (e, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    try { return await evaluate(e) } catch (err) { if (!/destroyed|Cannot find context/i.test(err.message) || i === tries - 1) throw err; await sleep(800) }
  }
}
let mounted = false
for (let i = 0; i < 60 && !mounted; i++) {
  try { mounted = await safe(`!!document.querySelector('#app')?.children.length`) } catch {}
  if (!mounted) await sleep(500)
}
check('页面已挂载', mounted)

await safe(`location.hash = '#/materials?standalone=1'; true`)
await sleep(1500)

// ① 先清空资料（**必须在选客户之前**，并且清完要重新加载页面）：
//    账期条只在「客户变化」时重新拉数据，光靠 API 清空界面不会自己变 ——
//    早先版本想用 __vueParentComponent.exposed.reload 刷新，那是**父组件**，压根调不到（静默无效）。
await safe(`(async () => {
  let token = localStorage.getItem('crystal_auth_token');
  if (!token) { const t = await (await fetch('/api/auth/token')).json(); token = t.data?.token; if (token) localStorage.setItem('crystal_auth_token', token); }
  await fetch('/api/customers/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': token || '' },
    body: JSON.stringify({ name: ${JSON.stringify(CUSTOMER)}, payment_terms: '', statement_day: 0, payment_days: 0, next_statement_date: '', pay_remark: '' }) });
  return true;
})()`)
await safe(`location.reload(); true`)
await sleep(4000)
for (let i = 0; i < 40; i++) {
  let ok = false
  try { ok = await safe(`!!document.querySelector('#app')?.children.length`) } catch {}
  if (ok) break
  await sleep(500)
}
await safe(`location.hash = '#/materials?standalone=1'; true`)
await sleep(2500)

// 选客户
const sel = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const input = document.querySelector('.customer-input');
  if (!input) return { ok: false, why: '没有客户选择框' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(CUSTOMER)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1200);
  const item = [...document.querySelectorAll('.customer-dropdown .cd-item')].find(e => (e.querySelector('.cd-name')?.textContent || '').includes(${JSON.stringify(CUSTOMER)}));
  if (item) item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(2500);
  const bar = document.querySelector('.cpb');
  return { ok: !!bar, text: (bar?.innerText || '').replace(/\\s+/g, ' ').trim() };
})()`)
check('页头出现账期条', sel.ok && (sel.text || '').length >= 0, sel.text || sel.why)
const empty = sel.text || ''
check('未填时提示「未设置账期」+ 可点入口', /未设置账期/.test(empty) && /点击填写/.test(empty), empty)

// ② 点开 → 填结构化口径 → 保存
const filled = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  document.querySelector('.cpb').click();
  await sleep(1200);
  const box = document.querySelector('.cpe');
  if (!box) return { ok: false, why: '编辑面板没打开' };
  const setV = (el, v) => { const s = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const inputs = [...document.querySelectorAll('.cpe-input')];
  setV(inputs[0], '月结30天');                    // 账期
  const nums = [...document.querySelectorAll('.cpe-input.num')];
  setV(nums[0], '5');                              // 每月对账日
  setV(nums[1], '30');                             // 对账后付款天数
  setV(document.querySelector('.cpe-textarea'), '每月 5 号发对账单，签收后 30 天付款');
  await sleep(400);
  [...document.querySelectorAll('.cpe-btn')].find(b => b.textContent.includes('保存')).click();
  await sleep(2500);
  const bar = document.querySelector('.cpb');
  // ⚠️ 判断「面板关了没」必须看**可见性**，不能看 DOM 里还在不在：
  //    Vant Popup 是 lazy-render + v-show，关闭后元素仍在 DOM 里，只是 display:none。
  //    早先按「存在与否」断言，结果把「已经关掉了」误判成「关不掉」（也差点反过来漏掉真 bug）。
  const panelVisible = (() => {
    const el = document.querySelector('.cpe');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && getComputedStyle(el.closest('.van-popup') || el).display !== 'none';
  })();
  const panelClosed = !panelVisible;
  // 再打开一次、点 ✕，确认能关掉（回归：外层点击把面板又打开）
  document.querySelector('.cpb').click();
  await sleep(1200);
  const reopenedVisible = (() => {
    const el = document.querySelector('.cpe');
    if (!el) return false;
    return el.getBoundingClientRect().width > 0;
  })();
  document.querySelector('.cpe-close')?.click();
  await sleep(1200);
  const closeWorks = (() => {
    const el = document.querySelector('.cpe');
    if (!el) return true;
    return el.getBoundingClientRect().width === 0;
  })();
  return { ok: true, text: (bar?.innerText || '').replace(/\\s+/g, ' ').trim(), cls: bar?.className || '', panelClosed, reopened: reopenedVisible, closeWorks };
})()`)
check('编辑面板能打开并保存', filled.ok, filled.why || '')
// ⚠️ 这条是补的回归断言：面板曾被放在「点一下就打开」的账期条内部，
//    面板里的点击冒泡到外层 ⇒ 保存后自己又弹回来 / 点 ✕ 关不掉。
check('保存后面板自动关闭（不能被外层点击重新打开）', filled.panelClosed === true, `panelClosed=${filled.panelClosed}`)
check('点 ✕ 能关掉面板', filled.closeWorks === true, `closeWorks=${filled.closeWorks}`)
console.log('  页头显示：', filled.text)
check('页头显示账期', /月结30天/.test(filled.text || ''))
// 今天 2026-10-15，每月 5 号 ⇒ 下次对账 2026-11-05（剩 21 天），对账后 30 天 ⇒ 应付 2026-12-05
check('自动算出下次对账日 + 剩余天数（每月5号 ⇒ 11-05）', /下次对账 2026-11-05/.test(filled.text || '') && /剩 \d+ 天/.test(filled.text || ''), filled.text)
check('算出应付日（对账日 + 30 天 ⇒ 12-05）', /应付 2026-12-05/.test(filled.text || ''), '')
check('显示备注', /每月 5 号发对账单/.test(filled.text || ''))

// ③ 手填具体日期 ⇒ 优先，且过期要提示
const manual = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  document.querySelector('.cpb').click();
  await sleep(1200);
  const setV = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  setV(document.querySelector('.cpe-input.date'), '2026-10-01');
  await sleep(300);
  [...document.querySelectorAll('.cpe-btn')].find(b => b.textContent.includes('保存')).click();
  await sleep(2500);
  const bar = document.querySelector('.cpb');
  return { text: (bar?.innerText || '').replace(/\\s+/g, ' ').trim(), cls: bar?.className || '' };
})()`)
console.log('  手填后的页头：', manual.text)
check('手填日期优先（不再是自动算的 11-05）', /2026-10-01/.test(manual.text || '') && !/2026-11-05/.test(manual.text || ''), manual.text)
check('手填标出「手动指定」', /手动指定/.test(manual.text || ''))
check('手填已过期要提示更新（且整条变红）', /已过期/.test(manual.text || '') && /请更新/.test(manual.text || '') && /red/.test(manual.cls || ''), manual.cls)

// ④ 落库核对（不只看界面）
const persisted = await safe(`(async () => {
  let token = localStorage.getItem('crystal_auth_token');
  const r = await (await fetch('/api/customers/profile?name=' + encodeURIComponent(${JSON.stringify(CUSTOMER)}), { headers: { 'x-auth-token': token || '' } })).json();
  return { terms: r.data?.payment_terms, day: r.data?.statement_day, pd: r.data?.payment_days, next: r.data?.next_statement_date, remark: r.data?.pay_remark, sched: r.data?.schedule?.statement_date };
})()`)
check('落库正确（账期/对账日/天数/手填日期/备注）',
  persisted.terms === '月结30天' && persisted.day === 5 && persisted.pd === 30 && persisted.next === '2026-10-01' && /对账单/.test(persisted.remark || ''),
  JSON.stringify(persisted))

// ⑤ 改成结构化口径（把手填清掉），再去名册管理核对
await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  document.querySelector('.cpb').click();
  await sleep(1200);
  document.querySelector('.cpe-clear')?.click();     // 清掉手填日期 ⇒ 回到自动算
  await sleep(300);
  [...document.querySelectorAll('.cpe-btn')].find(b => b.textContent.includes('保存')).click();
  await sleep(2200);
  return true;
})()`)
const registry = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('名册管理'));
  btn.click();
  await sleep(2500);
  const rows = [...document.querySelectorAll('.crm-row')].map(r => ({
    name: r.querySelector('.crm-name')?.textContent?.trim() || '',
    meta: (r.querySelector('.crm-meta')?.innerText || '').replace(/\\s+/g, ' ').trim(),
    delDisabled: r.querySelector('.mini.danger')?.disabled
  }));
  const mine = rows.find(r => r.name === ${JSON.stringify(CUSTOMER)});
  return { found: rows.length, mine: mine || null };
})()`)
console.log('  名册管理里该行：', JSON.stringify(registry.mine))
check('名册管理里能看到该客户的账期与下次对账日', !!registry.mine && /月结30天/.test(registry.mine.meta) && /下次对账/.test(registry.mine.meta), registry.mine?.meta || '')
check('填过账期的客户删除按钮被禁用（避免连资料一起删掉）', registry.mine?.delDisabled === true, String(registry.mine?.delDisabled))

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
ws.close()
process.exit(failed.length ? 1 : 0)
