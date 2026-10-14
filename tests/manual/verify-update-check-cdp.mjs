/**
 * 在线更新「能发现新版本」真机验证器 —— 真 Electron + CDP
 *
 * 为什么需要它：更新链路（GitHub Release → electron-updater → 主进程 IPC → 页面文案）
 * 任何一环坏了都是**静默**的 —— 页面上只会一直显示「已是最新版本」或卡在「连接中...」，
 * 而 vitest 覆盖不到（测试环境没有 electronAPI）。v1.0.220 就出过这个形态的缺陷
 * （下载早退不发事件，界面永久锁死），所以发版后必须真机跑一遍。
 *
 * 用法（两步）：
 *   1) 用**已安装的旧版本**（才能「发现新版本」）+ 沙箱数据 + 调试端口启动：
 *        $env:DATA_DIR = "D:\dsh-workspace\晶振报价软件\dev-data"
 *        & "D:\software\crystal-price-system\晶振报价管理系统.exe" --remote-debugging-port=9335
 *      ⚠️ 必须带 DATA_DIR=<沙箱>，否则读的是祥哥的生产数据目录。
 *   2) 另开终端跑：
 *        $env:DATA_DIR = "D:\dsh-workspace\晶振报价软件\dev-data"
 *        node tests\manual\verify-update-check-cdp.mjs
 *
 * 环境变量 EXPECT_VERSION 指定期望发现的新版本号（默认 1.0.221）。
 */
import fs from 'fs'
import path from 'path'

const PORT = Number(process.env.CDP_PORT || 9335)
const EXPECT = process.env.EXPECT_VERSION || '1.0.221'
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

console.log('\n================ 在线更新「发现新版本」验证 ================\n')

// 找到主界面（http://localhost: 那个目标）；闪屏是 data:text/html，跳过
let target = null
const deadline = Date.now() + 60000
while (Date.now() < deadline) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find(t => t.type === 'page' && (t.url || '').startsWith('http://localhost'))
    if (target) break
  } catch { /* 端口未就绪 */ }
  await sleep(500)
}
if (!target) throw new Error(`等不到主界面目标：软件是否带 --remote-debugging-port=${PORT} 启动？`)

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

// 等页面挂载完（window.__checkUpdate 是 Dashboard 挂载时挂上去的）
let hooked = false
const hookDeadline = Date.now() + 45000
while (Date.now() < hookDeadline) {
  try { hooked = await evaluate(`typeof window.__checkUpdate === 'function'`) } catch { /* 还在加载 */ }
  if (hooked) break
  await sleep(500)
}
check('页面已挂载且暴露了 window.__checkUpdate', hooked)
if (!hooked) { ws.close(); process.exit(1) }

const appVersion = await evaluate(`document.querySelector('.update-area') ? 'has-update-area' : 'no-update-area'`)
console.log(`  提示：.update-area 当前 ${appVersion}`)
// 设置抽屉是 Vant 懒渲染：没打开过时 .update-area **根本不在 DOM 里**（2026-10-14 实测：
// 不开抽屉去读 DOM 会一直读到空，误判成「更新链路坏了」，而日志里更新其实早跑完了）。
if (appVersion === 'no-update-area') {
  const opened = await evaluate(`(() => {
    const btn = document.querySelector('.settings-btn-wrap button') || [...document.querySelectorAll('button')].find(b => b.textContent.includes('⚙'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`)
  console.log(`  已尝试打开设置抽屉: ${opened}`)
  await sleep(1200)
}

// 工具栏红点是「后台静默下载」的可见标志，抽屉关着也能看到
const dotEarly = await evaluate(`!!document.querySelector('.update-dot')`)
console.log(`  工具栏更新红点（触发前）: ${dotEarly}`)

// 触发检查更新
console.log(`▶ 触发检查更新（期望发现 v${EXPECT}）`)
await evaluate(`window.__checkUpdate(); true`)

// 轮询页面上的真实文案（三种可判定的终态：发现新版本 / 已下载完成 / 已是最新 / 出错）
let seen = null
const pollDeadline = Date.now() + 90000
while (Date.now() < pollDeadline) {
  const state = await evaluate(`(() => {
    const area = document.querySelector('.update-area');
    return {
      area: !!area,
      text: area ? area.innerText.replace(/\\s+/g, ' ').trim() : '',
      dot: !!document.querySelector('.update-dot'),
      info: (document.querySelector('.update-info') || {}).innerText || '',
      status: (document.querySelector('.update-status') || {}).innerText || '',
      checking: !!(document.querySelector('.update-btn.checking'))
    };
  })()`)
  if (state.info || state.status || (!state.checking && state.text)) { seen = state; break }
  await sleep(1500)
}

if (!seen) {
  check('能读到更新区域状态', false, '90 秒内没读到任何稳定状态')
} else {
  console.log(`  更新区域文本：「${seen.text}」`)
  const foundNew = seen.text.includes(EXPECT) || seen.info.includes(EXPECT)
  const alreadyLatest = seen.status.includes('已是最新')
  const errored = /失败|错误|无法/.test(seen.text)
  if (alreadyLatest) {
    check(`发现了新版本 v${EXPECT}`, false, `页面说「已是最新版本」—— 线上 latest.yml 版本是否还是 ${EXPECT}？`)
  } else if (errored) {
    check(`发现了新版本 v${EXPECT}`, false, `页面报错：「${seen.text}」`)
  } else {
    check(`发现了新版本 v${EXPECT}`, foundNew, seen.text)
  }
  check('更新状态不是卡在「检查中...」', !seen.checking, seen.checking ? '仍显示检查中' : '已出终态')
  // v1.0.220 起是「检测到就后台静默下载」，顶部设置按钮上会有小红点
  check('设置按钮出现更新小红点（或已进入下载/就绪态）', seen.dot || /下载|已下载完成|重启安装/.test(seen.text),
    `dot=${seen.dot}`)
}

// 顺手把更新相关的日志落一份，便于复盘
try {
  const logPath = path.join(process.env.DATA_DIR, 'logs', 'startup.log')
  if (fs.existsSync(logPath)) {
    const tail = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(l => /update|更新|download/i.test(l)).slice(-12)
    console.log('\n  相关日志：')
    tail.forEach(l => console.log('    ' + l))
  }
} catch { /* 日志读不到不影响结论 */ }

console.log('\n================ 结果 ================')
const failed = results.filter(r => !r.pass)
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
ws.close()
process.exit(failed.length ? 1 : 0)
