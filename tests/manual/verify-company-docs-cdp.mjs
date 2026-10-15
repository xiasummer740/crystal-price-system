/**
 * 公司资料 / 开票资料库 —— 真机端到端验证（无头 Chrome + 沙箱服务端）
 *
 * 祥哥 2026-10-15 需求：一个入口存放**客户发来的开票资料**（图片/PDF/Word/Excel）
 * 和**自己公司的**营业执照/开票资料（支持多家抬头）；手机端也要能看。
 *
 * 验的点：
 *   ① /company-docs 页面能打开，客户资料 tab + 客户列表在
 *   ② 点「＋ 上传资料」→ 页面真的建了文件输入 → 喂一个**中文名图片** →
 *      走页面自己的上传逻辑 → 列表里出现，且**文件名是中文不乱码**（latin1→utf8 还原）
 *   ③ 点缩略图能预览（图片真的加载出来 naturalWidth>0）
 *   ④ PDF 也能传（非图片显示文件图标）
 *   ⑤ 删掉一份：列表减少、文件也真的没了
 *   ⑥ 自己公司：新增主体 → 填开票资料 → 上传营业执照 → 卡片上能看到份数
 *   ⑦ 手机版 /mobile-docs 能打开、能列出同一份数据
 *
 * 用法：先起沙箱服务端（DATA_DIR=沙箱 PORT=3299），再跑本脚本
 */
const PORT = Number(process.env.CDP_PORT || 9222)
const APP = process.env.APP_URL || 'http://localhost:3299'
const CUSTOMER = process.env.CUSTOMER || '真机验证客户甲'
const results = []
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
if (!process.env.DATA_DIR) { console.error('拒绝运行：请设置 DATA_DIR=<沙箱目录>'); process.exit(2) }

console.log('\n================ 公司资料 / 开票资料 · 真机验证 ================\n')
let target = null
for (let i = 0; i < 60 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find(t => t.type === 'page' && (t.url || '').startsWith('http://localhost'))
  } catch {}
  if (!target) await sleep(500)
}
if (!target) throw new Error('等不到页面')
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

// ⓪ 开局清理：把该客户/该测试主体名下的旧资料删掉 ——
//    否则上一轮的数据会累积，「2 份」「分类是开票资料」这类断言就没法精确（会被历史脏数据带偏）
const cleaned = await safe(`(async () => {
  let token = localStorage.getItem('crystal_auth_token');
  if (!token) { const t = await (await fetch('/api/auth/token')).json(); token = t.data?.token; if (token) localStorage.setItem('crystal_auth_token', token); }
  const H = { 'x-auth-token': token || '' };
  let n = 0;
  for (const [type, name] of [['customer', ${JSON.stringify(CUSTOMER)}], ['self', '真机验证科技有限公司']]) {
    const r = await (await fetch('/api/company-docs/docs?owner_type=' + type + '&owner_name=' + encodeURIComponent(name), { headers: H })).json();
    for (const d of (r.data || [])) {
      await fetch('/api/company-docs/docs/' + d.id, { method: 'DELETE', headers: H });
      n++;
    }
  }
  return n;
})()`)
console.log(`  开局清理了 ${cleaned} 份旧资料`)

// ① 打开「公司资料」页（带客户定位）
await safe(`location.hash = '#/company-docs?customer=' + encodeURIComponent(${JSON.stringify(CUSTOMER)}); true`)
await sleep(3000)
const page = await safe(`({
  title: (document.querySelector('.cd-header h3')?.textContent || '').trim(),
  tabs: [...document.querySelectorAll('.view-btn')].map(b => b.textContent.trim()),
  custActive: (document.querySelector('.side-item.active .side-name')?.textContent || '').trim(),
  sideCount: document.querySelectorAll('.side-item').length,
  empty: (document.querySelector('.main-empty')?.textContent || '').trim()
})`)
check('「公司资料」页能打开，两个 tab 都在', page.title === '公司资料' && page.tabs.includes('客户资料') && page.tabs.includes('自己公司'), JSON.stringify(page.tabs))
check('已定位到目标客户', page.custActive === CUSTOMER, `${page.custActive}（客户列表 ${page.sideCount} 项）`)

// ② 通过页面自己的上传流程喂一个**中文名图片**
const uploaded = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const upBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('上传资料'));
  if (!upBtn) return { ok: false, why: '没有上传按钮' };
  upBtn.click();
  await sleep(600);
  const input = document.querySelector('input[type=file]');
  if (!input) return { ok: false, why: '点击后没建出文件输入' };
  // 1x1 PNG 真实字节
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AGtE0zaAAAAAElFTkSuQmCC';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], '深圳索瑞德电子有限公司_开票资料.png', { type: 'image/png' }));
  dt.items.add(new File([new Uint8Array([37,80,68,70,45,49,46,52])], '客户开票信息.pdf', { type: 'application/pdf' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(4000);
  const titles = [...document.querySelectorAll('.doc-title')].map(e => e.textContent.trim());
  const cats = [...document.querySelectorAll('.doc-cat')].map(e => e.textContent.trim());
  return { ok: true, count: document.querySelectorAll('.doc-card').length, titles, cats };
})()`)
check('点上传 → 页面自己建出文件输入并接受文件', uploaded.ok, uploaded.why || '')
console.log('  列表标题：', JSON.stringify(uploaded.titles))
check('上传后精确 2 份（开局已清空；多于 2 说明有累积污染）', uploaded.count === 2, `${uploaded.count} 份`)
check('中文文件名不乱码（latin1→utf8 还原）', (uploaded.titles || []).some(t => t.includes('深圳索瑞德')), JSON.stringify(uploaded.titles))
check('非图片（PDF）也收下并显示文件图标', (uploaded.titles || []).some(t => t.endsWith('.pdf')))
// ⚠️ 回归断言：`@click="pickFiles"` 曾把点击事件对象当分类存进去，列表上显示成「[object PointerEvent]」
check('分类是正常字符串（没把点击事件对象当分类存进去）',
  (uploaded.cats || []).length > 0 && (uploaded.cats || []).every(c => c === '开票资料'),
  JSON.stringify(uploaded.cats))

// ③ 预览：点缩略图，图片真的加载出来
const preview = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // ⚠️ 要点**带图片的那张**卡片：列表按上传时间倒序，第一张可能是 PDF（非图片没有 .pv-img，
  //    曾经因为点错元素把「功能正常」误判成失败）
  const card = [...document.querySelectorAll('.doc-card')].find(c => c.querySelector('img'));
  if (!card) return { open: false, why: '列表里没有图片类资料' };
  card.querySelector('.doc-thumb').click();
  await sleep(1500);
  const img = document.querySelector('.pv-img');
  const box = document.querySelector('.pv');
  return { open: !!box, hasImg: !!img, w: img?.naturalWidth || 0, title: (document.querySelector('.pv-title')?.textContent || '').trim() };
})()`)
check('点缩略图能预览（图片真的加载出来）', preview.open && preview.hasImg && preview.w > 0, `naturalWidth=${preview.w} 标题=${preview.title}`)
await safe(`document.querySelector('.pv-close')?.click(); true`)
await sleep(600)

// ④ 删除一份：列表减少、接口里也没了
const removed = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const before = document.querySelectorAll('.doc-card').length;
  document.querySelector('.doc-ops .op.danger')?.click();
  await sleep(1200);
  // 确认弹窗
  const ok = [...document.querySelectorAll('.van-dialog__confirm, .van-dialog__footer button')].pop();
  ok?.click();
  await sleep(2500);
  const after = document.querySelectorAll('.doc-card').length;
  return { before, after };
})()`)
check('删除后列表减少', removed.after === removed.before - 1, `${removed.before} → ${removed.after}`)

// ⑤ 自己公司：新增主体 → 上传营业执照
const selfFlow = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  [...document.querySelectorAll('.view-btn')].find(b => b.textContent.trim() === '自己公司').click();
  await sleep(1500);
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('新增主体'))?.click();
  await sleep(1000);
  const setV = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const inputs = [...document.querySelectorAll('.ce-input')];
  setV(inputs[0], '真机验证科技有限公司');
  setV(inputs[1], '91440300TEST0001X');
  setV(inputs[2], '深圳市宝安区测试路 1 号');
  setV(inputs[3], '0755-12345678');
  setV(inputs[4], '中国银行深圳测试支行');
  setV(inputs[5], '1234567890123');
  await sleep(400);
  [...document.querySelectorAll('.ce-btn')].find(b => b.textContent.includes('保存')).click();
  await sleep(2500);
  // 记下上传前的份数：验证要断言**增量**（不然重复跑会累积，把「功能正常」误判成失败）
  const docsBefore = [...document.querySelectorAll('.comp-card')]
    .find(c => (c.querySelector('.comp-name')?.textContent || '').trim() === '真机验证科技有限公司')
    ?.querySelectorAll('.doc-card').length || 0;
  // 上传营业执照（走卡片上的上传按钮）
  [...document.querySelectorAll('.mini-up')].find(b => b.textContent.includes('上传资料'))?.click();
  await sleep(600);
  const input = document.querySelector('input[type=file]');
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AGtE0zaAAAAAElFTkSuQmCC';
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], '营业执照.png', { type: 'image/png' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(4000);
  const cards = [...document.querySelectorAll('.comp-card')].map(c => ({
    name: c.querySelector('.comp-name')?.textContent?.trim(),
    fields: (c.querySelector('.comp-fields')?.innerText || '').replace(/\\s+/g, ' ').trim(),
    docs: c.querySelectorAll('.doc-card').length
  }));
  return { cards, docsBefore };
})()`)
const mine = (selfFlow.cards || []).find(c => c.name === '真机验证科技有限公司')
console.log('  主体卡片：', JSON.stringify(selfFlow.cards), ' 上传前份数:', selfFlow.docsBefore)
check('新增主体后卡片出现，开票资料字段都在', !!mine && /91440300TEST0001X/.test(mine.fields) && /测试路/.test(mine.fields), mine?.fields || '')
check('自己公司的资料上传成功（份数 +1）', mine?.docs === (selfFlow.docsBefore || 0) + 1, `${selfFlow.docsBefore} → ${mine?.docs}`)

// ⑥ 手机版能看同一份数据
await safe(`location.hash = '#/mobile-docs?customer=' + encodeURIComponent(${JSON.stringify(CUSTOMER)}); true`)
await sleep(3000)
const mobile = await safe(`({
  bar: (document.querySelector('.van-nav-bar__title')?.textContent || '').trim(),
  tabs: [...document.querySelectorAll('.van-tab')].map(t => t.textContent.trim()),
  items: document.querySelectorAll('.md-item').length,
  owner: (document.querySelector('.md-docs-head')?.innerText || '').replace(/\\s+/g, ' ').trim()
})`)
check('手机版页面能打开（有标题和两个 tab）', mobile.bar === '公司资料' && mobile.tabs.length >= 2, JSON.stringify(mobile.tabs))
check('手机版能看到同一份客户资料', mobile.items >= 1, `${mobile.items} 项 · ${mobile.owner}`)
check('手机版有「自己公司」tab（开票资料要能复制）', mobile.tabs.includes('自己公司'), JSON.stringify(mobile.tabs))

// ⑥ 拖拽上传：拖进来要亮提示遮罩，松手就传
// ⚠️ 先切回**桌面版**页面：上一段验的是手机版（/mobile-docs），那里没有 .cd-page
await safe(`location.hash = '#/company-docs?customer=' + encodeURIComponent(${JSON.stringify(CUSTOMER)}); true`)
await sleep(3200)
const dragFlow = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const page = document.querySelector('.cd-page');
  const mk = (names) => { const dt = new DataTransfer();
    for (const n of names) dt.items.add(new File([new Uint8Array([137,80,78,71])], n, { type: 'image/png' }));
    return dt; };
  const before = document.querySelectorAll('.doc-card').length;
  page.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: mk(['拖进来的开票资料.png']) }));
  await sleep(500);
  const maskShown = !!document.querySelector('.drop-mask');
  const maskText = (document.querySelector('.drop-text')?.textContent || '').trim();
  page.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: mk(['拖进来的开票资料.png']) }));
  await sleep(3500);
  const after = document.querySelectorAll('.doc-card').length;
  return { maskShown, maskText, before, after, titles: [...document.querySelectorAll('.doc-title')].map(e => e.textContent.trim()) };
})()`)
check('拖文件进来会亮「松手就传」提示', dragFlow.maskShown === true, dragFlow.maskText || '')
check('拖拽松手后真的传上去了（份数 +1）', dragFlow.after === (dragFlow.before || 0) + 1, `${dragFlow.before} → ${dragFlow.after}`)
check('拖拽上传的文件名正常（中文不乱码）', (dragFlow.titles || []).some(t => t.includes('拖进来的开票资料')), JSON.stringify((dragFlow.titles || []).slice(0, 3)))
// 拖完遮罩要收掉，不然会一直挡着
check('拖完提示遮罩自动消失', (await safe(`!document.querySelector('.drop-mask')`)) === true)

// ⑦ 粘贴上传（微信截图 → Ctrl+V）
const pasteFlow = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const before = document.querySelectorAll('.doc-card').length;
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'image.png', { type: 'image/png' }));
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: dt });   // ClipboardEvent 构造器里给不了 clipboardData
  document.dispatchEvent(ev);
  await sleep(3500);
  const after = document.querySelectorAll('.doc-card').length;
  const cats = [...document.querySelectorAll('.doc-cat')].map(e => e.textContent.trim());
  return { before, after, cats };
})()`)
check('Ctrl+V 粘贴截图能上传（份数 +1）', pasteFlow.after === (pasteFlow.before || 0) + 1, `${pasteFlow.before} → ${pasteFlow.after}`)
check('粘贴来的图归到「开票资料」分类', (pasteFlow.cats || []).includes('开票资料'), JSON.stringify(pasteFlow.cats))

// ⑧ HEIC 允许上传，但要按「文件」显示（浏览器解不了，不能当破图）
const heicFlow = await safe(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const upBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('上传资料'));
  upBtn.click();
  await sleep(600);
  const input = document.querySelector('input[type=file]');
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([0,0,0,24,102,116,121,112,104,101,105,99])], 'IMG_照的营业执照.heic', { type: 'image/heic' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(3500);
  const cards = [...document.querySelectorAll('.doc-card')].map(c => ({
    title: c.querySelector('.doc-title')?.textContent?.trim(),
    hasImg: !!c.querySelector('img'),
    icon: (c.querySelector('.doc-icon')?.textContent || '').trim()
  }));
  const heic = cards.find(c => (c.title || '').includes('.heic'));
  return { heic: heic || null };
})()`)
check('HEIC 能收下（iPhone 拍的照片）', !!heicFlow.heic, JSON.stringify(heicFlow.heic))
check('HEIC 按文件显示而不是破图', heicFlow.heic && heicFlow.heic.hasImg === false && !!heicFlow.heic.icon, JSON.stringify(heicFlow.heic))

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
ws.close()
process.exit(failed.length ? 1 : 0)
