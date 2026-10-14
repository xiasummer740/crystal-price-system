/**
 * 启动动画（闪屏）回归验证器 —— 真机 + CDP
 *
 * 为什么需要它：闪屏是一段 `data:text/html` 内联页面，vitest / 浏览器都碰不到它，
 * 只有真 Electron 起来那 1~2 秒里能看到。2026-10-14 改了两处，都必须在真机上确认：
 *   ① logo 从 SJK-256.png（256×256、alpha 全 255 = 不透明白方块）换成 SJK.png
 *      （815×254 透明字标）—— 判据直接读 `naturalWidth/naturalHeight`，
 *      改了哪张图一目了然，不靠肉眼看截图；
 *   ② 新增「已 N 秒」提示行（hint），初始文案是「正在启动…」。
 *
 * 用法（两步）：
 *   1) 用沙箱数据启动真实软件，并开调试端口：
 *        $env:DATA_DIR = "D:\dsh-workspace\晶振报价软件\dev-data"
 *        .\node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
 *      ⚠️ 必须带 DATA_DIR=<沙箱>；先看日志里的 "Window bounds:" 确认打开的是沙箱再往下做。
 *   2) 另开一个终端跑：
 *        $env:DATA_DIR = "D:\dsh-workspace\晶振报价软件\dev-data"
 *        node tests\manual\verify-splash-cdp.mjs
 *
 * 闪屏存活时间很短（主窗口就绪就关），所以脚本会**轮询等它出现**，抢在那 1~2 秒里取证。
 * 截图落到 <DATA_DIR>\_splash.png，供人工复核。
 */
import path from 'path'
import fs from 'fs'

const PORT = Number(process.env.CDP_PORT || 9333)   // 验打包产物时用 9334，别和开发版撞端口
const EXPECT_LOGO = { w: 815, h: 254 }   // client/public/SJK.png 的原始尺寸
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

console.log('\n================ 启动动画（闪屏）回归验证 ================\n')

// 轮询等闪屏目标出现（它是 data:text/html，和主窗口的 http://localhost 明显不同）
let target = null
const deadline = Date.now() + 20000
while (Date.now() < deadline) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find(t => t.type === 'page' && (t.url || '').startsWith('data:text/html'))
    if (target) break
  } catch { /* 端口还没起来，继续等 */ }
  await sleep(80)
}
if (!target) throw new Error(`等不到闪屏目标：软件是否带 --remote-debugging-port=${PORT} 启动？或闪屏已关闭`)

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
  if (r.exceptionDetails) throw new Error('闪屏内执行出错: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
  return r.result.value
}

// ① 等 DOM 画出来再取证。
// 坑（2026-10-14 实测）：CDP 的 page 目标是**窗口一创建**就出现在 /json/list 里的，
// 那时 data: 页面还没解析完 —— 直接读会读到一片空的（card=false、hint=""），
// 看起来像「功能没生效」，其实是抢跑了。所以这里轮询等 .card 出现。
let ready = false
const domDeadline = Date.now() + 8000
while (Date.now() < domDeadline) {
  try {
    ready = await evaluate(`!!document.querySelector('.card')`)
    if (ready) break
  } catch { /* 闪屏已关闭或正在导航，继续等 */ }
  await sleep(100)
}
check('闪屏 DOM 就绪（.card 出现）', ready)

// 一次取全，减少往返
const dom = await evaluate(`(() => {
  const img = document.querySelector('.card img');
  const hint = document.getElementById('hint');
  const r = img ? img.getBoundingClientRect() : null;
  return {
    hasCard: !!document.querySelector('.card'),
    hasImg: !!img,
    srcHead: img ? img.src.slice(0, 22) : '',
    naturalW: img ? img.naturalWidth : 0,
    naturalH: img ? img.naturalHeight : 0,
    cssW: img ? getComputedStyle(img).width : '',
    borderRadius: img ? getComputedStyle(img).borderRadius : '',
    title: (document.querySelector('h2') || {}).textContent || '',
    hintText: hint ? hint.textContent : '',
    hasBar: !!document.querySelector('.bar-inner'),
    // 居中判据：logo 外接框中心 vs 窗口中心。字体/行高再变也不会影响 logo（它是绝对定位），
    // 所以这两条断言是能长期守住的回归护栏（祥哥 2026-10-14 明确要求 logo 严格居中）。
    logoCx: r ? r.left + r.width / 2 : -1,
    logoCy: r ? r.top + r.height / 2 : -1,
    winW: innerWidth,
    winH: innerHeight
  };
})()`)

check('闪屏卡片已渲染', dom.hasCard && dom.hasBar, `card=${dom.hasCard} 进度条=${dom.hasBar}`)
check('logo 是内嵌 base64 PNG（asar 内不能走 file://）', dom.srcHead.startsWith('data:image/png;base64'), dom.srcHead)
check(
  `logo 用的是透明字标 SJK.png（${EXPECT_LOGO.w}×${EXPECT_LOGO.h}）`,
  dom.naturalW === EXPECT_LOGO.w && dom.naturalH === EXPECT_LOGO.h,
  `实际自然尺寸=${dom.naturalW}×${dom.naturalH}`
)
check('logo 按字标宽度渲染、不再是 96px 方块', dom.cssW === '224px', `CSS 宽=${dom.cssW} 圆角=${dom.borderRadius}`)
check('标题文字正确', dom.title === '晶振报价管理系统', JSON.stringify(dom.title))
check('提示行已就位（初始「正在启动…」）', dom.hintText.includes('正在启动'), JSON.stringify(dom.hintText))
// logo 严格居中（祥哥 2026-10-14 要求）：水平与垂直都必须在窗口中心 1px 内。
// 旧版流式布局实测垂直偏上 50px（logo 中心 y=120 / 窗口中心 y=170），这两条就是钉死它的。
const dx = Math.abs(dom.logoCx - dom.winW / 2)
const dy = Math.abs(dom.logoCy - dom.winH / 2)
check('logo 水平居中于窗口（≤1px）', dx <= 1, `偏差 ${dx.toFixed(1)}px（logo 中心 x=${dom.logoCx.toFixed(1)}，窗口中心 ${dom.winW / 2}）`)
check('logo 垂直居中于窗口（≤1px）', dy <= 1, `偏差 ${dy.toFixed(1)}px（logo 中心 y=${dom.logoCy.toFixed(1)}，窗口中心 ${dom.winH / 2}）`)

// ② 截图留证。
// 等 1.2 秒再截：卡片的 fadeIn 是 0.8 秒淡入，DOM 一就绪就截会拍到「几乎全透明」的一片，
// 存档里看不出长什么样（2026-10-14 实测：抢拍只有 6.3 KB，等动画走完是 46 KB）。
await sleep(1200)
let shot = null
try {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  shot = path.join(process.env.DATA_DIR, '_splash.png')
  fs.writeFileSync(shot, Buffer.from(r.data, 'base64'))
  check('闪屏截图已保存', fs.existsSync(shot) && fs.statSync(shot).size > 1000, `${shot} (${fs.statSync(shot).size} B)`)
} catch (e) {
  check('闪屏截图已保存', false, e.message)
}

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
if (shot) console.log(`截图：${shot}`)
console.log('提示：慢启动提示（「已 N 秒」）另由 verify-splash-slowstart-cdp.mjs 验证。')
ws.close()
process.exit(failed.length ? 1 : 0)
