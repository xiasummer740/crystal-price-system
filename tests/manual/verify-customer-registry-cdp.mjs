/**
 * 客户名册管理（删除/合并）— 真机端到端验证
 *
 * 为什么必须真机跑：这条链路是「页面按钮 → api.js → Express → sql.js 改 4 张表 → 页面刷新」，
 * vitest 覆盖不到（测试环境没有真实服务与数据）；而它的失败形态恰恰是**静默**的
 * （点了没反应、或改了名册却没改源头 ⇒ 名字过一会儿又冒出来）。
 *
 * 前置：先用 seed-junk-sandbox.mjs 往沙箱塞「测试简写甲」（2 条在用 + 1 条回收站 + 名册 1 条），
 *       再用 DATA_DIR=沙箱 起真机软件并开 CDP 端口。
 * 用法：$env:DATA_DIR="...dev-data"; $env:CDP_PORT=9337; node tests\manual\verify-customer-registry-cdp.mjs
 */
const PORT = Number(process.env.CDP_PORT || 9337)
const ABBR = process.env.ABBR || '测试简写甲'
const FULL = process.env.FULL || '测试全名有限公司'
const results = []
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
if (!process.env.DATA_DIR) { console.error('拒绝运行：请设置 DATA_DIR=<沙箱目录>'); process.exit(2) }

console.log('\n================ 客户名册管理 · 真机验证 ================\n')

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

// 等页面挂载
let ok = false
const hd = Date.now() + 45000
while (Date.now() < hd) { try { ok = await evaluate(`!!document.querySelector('#app')?.children.length`) } catch {}; if (ok) break; await sleep(500) }
check('页面已挂载', ok)

// ① 进「客户物料」页并打开名册管理
await evaluate(`location.hash = '#/materials?standalone=1'; true`)
await sleep(3000)
const opened = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '名册管理');
  if (!btn) return { ok: false, why: '页面上没有「名册管理」按钮' };
  btn.click();
  await sleep(1800);
  return { ok: !!document.querySelector('.crm'), hasTip: !!document.querySelector('.crm-tip') };
})()`)
check('「名册管理」按钮存在于客户物料页', opened.ok, opened.ok ? '' : opened.why)
check('名册弹窗打开且带「并集」提示（防止误以为名册是独立名单）', opened.hasTip)
if (!opened.ok) { ws.close(); process.exit(1) }

// ② 搜出那个简写，核对引用计数与删除按钮状态
const row = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const input = document.querySelector('.crm .van-search input') || document.querySelector('.crm input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(ABBR)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1800);
  const r = [...document.querySelectorAll('.crm-row')].find(x => x.querySelector('.crm-name')?.textContent.trim() === ${JSON.stringify(ABBR)});
  if (!r) return { ok: false, rows: [...document.querySelectorAll('.crm-row .crm-name')].map(x => x.textContent.trim()) };
  const del = [...r.querySelectorAll('button')].find(b => b.textContent.trim() === '删除');
  return {
    ok: true,
    meta: r.querySelector('.crm-meta')?.innerText.replace(/\\s+/g, ' ').trim(),
    delDisabled: del ? del.disabled : null
  };
})()`)
check('能在名册管理里搜到该简写', row.ok, row.ok ? '' : `实际列出的: ${JSON.stringify(row.rows)}`)
check('引用计数含回收站（应显示 报价 3）', /报价\s*3/.test(row.meta || ''), row.meta)
check('有引用时「删除」按钮是禁用的', row.delDisabled === true, `disabled=${row.delDisabled}`)

// ③ 走真按钮：合并到… → 填全名 → 预览影响 → 确认合并 → 点确认弹窗
const merged = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const row = [...document.querySelectorAll('.crm-row')].find(x => x.querySelector('.crm-name')?.textContent.trim() === ${JSON.stringify(ABBR)});
  const mergeBtn = [...row.querySelectorAll('button')].find(b => b.textContent.includes('合并到'));
  mergeBtn.click();
  await sleep(600);
  const input = row.querySelector('.crm-merge input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(FULL)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(400);
  const previewBtn = [...row.querySelectorAll('button')].find(b => b.textContent.includes('预览影响'));
  previewBtn.click();
  await sleep(1500);
  const previewText = row.querySelector('.crm-preview')?.innerText.replace(/\\s+/g, ' ').trim() || '';
  const confirmBtn = [...row.querySelectorAll('button')].find(b => b.textContent.includes('确认合并'));
  confirmBtn.click();
  await sleep(1200);
  const dialog = document.querySelector('.van-dialog');
  const dialogText = dialog ? dialog.innerText.replace(/\\s+/g, ' ').trim() : '';
  const okBtn = document.querySelector('.van-dialog__confirm');
  if (okBtn) okBtn.click();
  await sleep(2500);
  return { previewText, dialogText, clicked: !!okBtn };
})()`)
check('「预览影响」先给出将改动条数（不盲改）', /3/.test(merged.previewText || ''), merged.previewText)
check('确认弹窗把影响写清楚了（列出会改哪些表）', /报价记录 3/.test(merged.dialogText || '') && /不会删/.test(merged.dialogText || ''), merged.dialogText.slice(0, 90))
check('确认按钮点了（走了真实交互，不是直接调接口）', merged.clicked)

// ④ 合并后的账：接口层面 + 界面层面都要对
const after = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const r1 = await (await fetch('/api/customers/list?limit_as_list=1')).json();
  const names = r1.data || [];
  const r2 = await (await fetch('/api/materials/customers/list')).json();
  const pageNames = (r2.data || []).map(x => x.customer);
  // 名册管理里再搜一次简写，应该搜不到了
  const input = document.querySelector('.crm input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(ABBR)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1500);
  const stillListed = [...document.querySelectorAll('.crm-row .crm-name')].map(x => x.textContent.trim());
  return { inUnion: names.includes(${JSON.stringify(ABBR)}), fullInUnion: names.includes(${JSON.stringify(FULL)}), pageHasAbbr: pageNames.includes(${JSON.stringify(ABBR)}), stillListed };
})()`)
check('统一接口里简写已消失', after.inUnion === false)
check('统一接口里出现了合并后的全名', after.fullInUnion === true)
check('客户物料页的客户列表也不再含简写', after.pageHasAbbr === false)
check('名册管理里再搜该简写已无结果', after.stillListed.length === 0, JSON.stringify(after.stillListed))

// ⑤ 报价记录真的被改了（源头）
const quotes = await evaluate(`(async () => {
  const r = await (await fetch('/api/customers/manage?keyword=' + encodeURIComponent(${JSON.stringify(FULL)}))).json();
  const row = (r.data || []).find(x => x.name === ${JSON.stringify(FULL)});
  return row ? { refs: row.refs, total: row.ref_total } : null;
})()`)
check('源头已改：全名下挂着报价 3 条、简写下 0 条', quotes && quotes.refs.quotes === 3, JSON.stringify(quotes))

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
ws.close()
process.exit(failed.length ? 1 : 0)
