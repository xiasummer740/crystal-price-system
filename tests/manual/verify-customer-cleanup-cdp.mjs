/**
 * 客户名清理 — 真机端到端验证（沙箱）
 *
 * 背景：2026-10-14 祥哥发现「客户物料」里混着「国润」「图科、」这类手打简写。
 * 根因：客户列表是「名册 ∪ 客户物料 ∪ 报价的首次询价客户 ∪ 记事 ∪ 地图」的**并集**，
 * 而报价记录的「首次询价客户」字段被手打了简写 ⇒ 2026-10-14 10:15:11 启动回填时被带进名册。
 *
 * 已在库层面清掉（报价记录改成全名 + 删名册残留）。本脚本验的是**页面看到的结果**：
 * 把清理后的库放进沙箱跑真机，读页面自己用的那个接口 + 真在输入框里打「国润」看下拉。
 *
 * 用法：
 *   1) 把清理后的库放进沙箱： copy 生产\数据库\data.db → <DATA_DIR>\数据库\data.db
 *   2) $env:DATA_DIR="D:\dsh-workspace\晶振报价软件\dev-data"
 *      .\node_modules\electron\dist\electron.exe . --remote-debugging-port=9336
 *   3) $env:DATA_DIR=...; $env:CDP_PORT=9336; node tests\manual\verify-customer-cleanup-cdp.mjs
 */
const PORT = Number(process.env.CDP_PORT || 9336)
const ABBR = ['国润', '茂润', '图科、', '沃尔芯', '乐众云、', '云天信息', '宏泽兴、', '重庆华虹', '鑫博创美', '高起乐、', '天津缇乐斯']
const FULL = ['深圳市国润聚源科技有限公司', '深圳市茂润电子有限公司', '深圳市图科电子有限公司',
  '青岛沃尔芯智能工业有限公司', '深圳市乐众云科技有限公司', '云天智能信息（深圳）有限公司',
  '深圳市宏泽兴电子科技有限公司', '重庆华虹仪表有限公司', '深圳市鑫博创美电子科技有限公司',
  '上海高起乐实业有限公司', '天津缇乐斯贸易有限公司']
const results = []
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
if (!process.env.DATA_DIR) { console.error('拒绝运行：请设置 DATA_DIR=<沙箱目录>'); process.exit(2) }

console.log('\n================ 客户名清理 · 真机验证 ================\n')

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

// ① 页面自己用的接口：客户列表
const listRes = await evaluate(`(async () => {
  const r = await fetch('/api/materials/customers/list');
  const j = await r.json();
  const names = (j.data || []).map(x => x.customer);
  return { total: names.length, names };
})()`)
console.log(`  客户列表总数（页面下拉用的就是这个）: ${listRes.total}`)
const leaked = ABBR.filter(a => listRes.names.includes(a))
check('11 个手打简写都不在客户列表里', leaked.length === 0, leaked.length ? `仍在: ${JSON.stringify(leaked)}` : '一个不剩')
const missingFull = FULL.filter(f => !listRes.names.includes(f))
check('11 个全名都在客户列表里', missingFull.length === 0, missingFull.length ? `缺失: ${JSON.stringify(missingFull)}` : '全都在')
check('客户总数与库一致（137）', listRes.total === 137, `实际 ${listRes.total}`)

// ② 界面：在「客户物料」页输入框里打「国润」，看下拉给什么
await evaluate(`location.hash = '#/materials?standalone=1'; true`)
await sleep(3000)
const drop = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const input = document.querySelector('.customer-input');
  if (!input) return { ok: false, why: '没找到客户输入框' };
  const clear = document.querySelector('.cs-clear');
  if (clear) { clear.click(); await sleep(800); }
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '国润');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1500);
  const sug = document.querySelector('.customer-dropdown');
  const items = sug ? [...sug.querySelectorAll('.cd-item .cd-name')].map(e => e.textContent.trim().replace(/\\s+/g, ' ').replace(/^👤\\s*/, '')) : [];
  const groups = sug ? [...sug.querySelectorAll('.cd-group-title')].map(e => e.textContent.trim()) : [];
  return { ok: true, items, groups };
})()`)
if (!drop.ok) check('客户物料页输入框可用', false, drop.why)
else {
  console.log(`  下拉候选: ${JSON.stringify(drop.items)}`)
  check('下拉里不再出现裸的「国润」', !drop.items.some(t => /^国润(\s|$)/.test(t) || t === '国润'), JSON.stringify(drop.items))
  check('下拉里能看到「深圳市国润聚源科技有限公司」', drop.items.some(t => t.includes('深圳市国润聚源科技有限公司')), '')
}

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
ws.close()
process.exit(failed.length ? 1 : 0)
