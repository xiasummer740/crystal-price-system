/**
 * 图片预览「右键复制」回归验证器
 *
 * 为什么需要它：这条链路是「页面 → preload → 主进程剪贴板」，vitest 覆盖不到
 * （测试环境里没有 electronAPI），而这正是本次出过 bug 的地方
 * （第一版用「图片数组 + 当前下标」取 URL，取到空串，菜单能弹但复制报「没有图片地址」）。
 *
 * 用法（两步）：
 *   1) 用沙箱数据启动真实软件，并开一个调试端口：
 *        $env:DATA_DIR = "D:\dsh-workspace\晶振报价软件\dev-data"
 *        .\node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
 *      ⚠️ 必须带 DATA_DIR=<沙箱>。不带会读到用户配置里的生产数据目录。
 *   2) 另开一个终端跑：
 *        $env:DATA_DIR = "D:\dsh-workspace\晶振报价软件\dev-data"
 *        node tests\manual\verify-image-copy-cdp.mjs
 *
 * 覆盖：页面渲染 → 选客户 → 开图片预览 → 右键弹菜单 → 点复制 → 菜单收起，
 *       并把「页面上那张图的原始 PNG」写到 <DATA_DIR>\_page-image.png，
 *       供人工/脚本与系统剪贴板做逐像素比对（比对用 electron 的 clipboard，见文件末尾说明）。
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 9333
const CUSTOMER = '深圳市国润聚源科技有限公司'   // 该客户在沙箱数据里有带图记录
const results = []
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

if (!process.env.DATA_DIR) {
  console.error('拒绝运行：请设置 DATA_DIR=<沙箱目录>，避免误连生产数据')
  process.exit(2)
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const target = list.find(t => t.type === 'page')
if (!target) throw new Error(`没有页面目标：软件是否带 --remote-debugging-port=${PORT} 启动？`)
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

console.log('\n================ 图片右键复制 回归验证 ================\n')

// ① 客户物料页
console.log('▶ 步骤 1：切到「客户物料」页')
await evaluate(`location.hash = '#/materials?standalone=1'; true`)
await sleep(3000)
check('客户物料页已渲染', (await evaluate(`document.querySelector('.customer-input') ? 'ok' : 'missing'`)) === 'ok')

// ② 选客户（下拉项 .cd-item 上没有 Vue click 绑定，走输入框 @keydown 的回车路径）
console.log(`▶ 步骤 2：选中客户「${CUSTOMER}」`)
await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clear = document.querySelector('.cs-clear');
  if (clear) { clear.click(); await sleep(1200); }
  const input = document.querySelector('.customer-input');
  input.focus();
  await sleep(200);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(CUSTOMER)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(800);
  return true;
})()`)
for (const type of ['keyDown', 'char', 'keyUp']) {
  await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
}
await sleep(3500)
const rows = await evaluate(`document.querySelectorAll('tbody tr').length`)
const rimgs = await evaluate(`document.querySelectorAll('.rimgs-btn').length`)
check('选中客户并加载列表', rows > 0, `行数=${rows}`)
check('列表里有带「备注图片」的记录', rimgs > 0, `带图按钮=${rimgs}`)
if (!rows || !rimgs) { ws.close(); process.exit(1) }

// ③ 打开预览 + 右键
console.log('▶ 步骤 3：打开图片预览，在图片上派发右键')
const step3 = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const btn = document.querySelector('.rimgs-btn');
  btn.click();
  await sleep(2200);
  const img = document.querySelector('.van-image-preview__image img');
  if (!img) return { ok: false, why: '预览图片没出现' };
  window.__vimg = img;
  const r = img.getBoundingClientRect();
  img.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, button: 2,
    clientX: Math.round(r.left + r.width/2), clientY: Math.round(r.top + r.height/2)
  }));
  await sleep(800);
  const menu = document.querySelector('.img-ctx-menu');
  return { ok: !!menu, items: menu ? [...menu.querySelectorAll('.img-ctx-item')].map(b => b.textContent.trim()) : [] };
})()`)
check('图片上右键弹出菜单', !!step3.ok, step3.ok ? `菜单项=${JSON.stringify(step3.items)}` : step3.why)
if (!step3.ok) { ws.close(); process.exit(1) }
check('菜单只有「复制图片」一项', step3.items.length === 1 && step3.items[0].includes('复制图片'), JSON.stringify(step3.items))

// ④ 存下页面上那张图的原始 PNG，供与剪贴板比对
console.log('▶ 步骤 4：点「复制图片」')
const b64 = await evaluate(`(async () => {
  const img = window.__vimg;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
})()`)
fs.writeFileSync(path.join(process.env.DATA_DIR, '_page-image.png'), Buffer.from(b64, 'base64'))

const clicked = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const copy = [...document.querySelectorAll('.img-ctx-item')].find(b => b.textContent.includes('复制图片'));
  if (!copy) return { found: false, why: '没找到复制按钮' };
  copy.click();
  await sleep(3500);
  const toast = document.querySelector('.van-toast');
  return { found: true, menuGone: !document.querySelector('.img-ctx-menu'), toast: toast ? toast.innerText.trim() : '' };
})()`)
check('点「复制图片」提示成功', clicked.found && /已复制/.test(clicked.toast || ''), clicked.found ? clicked.toast : clicked.why)
check('复制后菜单自动收起', clicked.menuGone)

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
console.log(`页面上那张图的原始 PNG 已写到 ${path.join(process.env.DATA_DIR, '_page-image.png')}`)
console.log('与系统剪贴板做逐像素比对（electron 的 clipboard 只能在 electron 里读）：')
console.log('  写个临时 mjs：clipboard.readImage().toBitmap() 与 nativeImage.createFromBuffer(上面的png).toBitmap() 比 Buffer')
ws.close()
process.exit(failed.length ? 1 : 0)
