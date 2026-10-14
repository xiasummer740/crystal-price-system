/**
 * 「启动慢」提示行验证器 —— 真 Electron 里跑**出厂的那段 HTML**
 *
 * 背景：2026-10-14 祥哥报「偶尔启动卡在动画」。查 startup.log：196 次启动里 17 次超 30 秒，
 * 最慢一次 164 秒；而且那段时间主进程被同步任务堵死，**连兜底定时器都轮不到执行** ——
 * 用户看到的是一个一动不动、也看不出还活着的动画（详见 electron/main.js 里 showSplash 的注释）。
 *
 * 修法是在闪屏里加一条**跑在渲染进程**的计时提示（主进程堵住它也照样在走）。
 * 这条逻辑没法用 vitest 验，也没法用真实启动验 —— 正常启动 1~2 秒闪屏就关了，永远走不到
 * 「已 N 秒」那两档。所以本脚本**直接从 electron/main.js 里抽出出厂的那段 html 字符串**
 * （只把 ${logoSrc} 换成真图），写进临时文件后用真 Electron 加载，再把时间轴快进着读文本。
 *
 * ⚠️ 抽的是**源文件里的同一段字符串**，不是重打一遍的副本 —— 改了 main.js 这段，
 *    这里验的就是改后的版本，不存在「测试和出厂不是一份」的问题。
 *
 * ⚠️ 为什么结果要写文件：electron.exe 在 Windows 上是 GUI 子系统程序，**stdout 抓不到**
 *    （2026-10-14 实测：跑完一身轻，屏幕上什么都没有）。所以每项结果都落盘到
 *    tests/manual/_splash-slowstart-report.txt，退出码 0 = 全过。
 *
 * 用法：
 *   $env:DATA_DIR = "D:\dsh-workspace\晶振报价软件\dev-data"   # 本脚本不读数据，仅为遵守沙箱红线
 *   .\node_modules\electron\dist\electron.exe tests\manual\verify-splash-slowstart.mjs
 */
import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..')
const REPORT = path.join(__dirname, '_splash-slowstart-report.txt')

const lines = []
const results = []
function say(s) { lines.push(s) }
function check(name, pass, detail = '') {
  results.push({ name, pass })
  say(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
/** 落盘报告后退出。GUI 进程看不到 stdout，报告文件是唯一的证据出口。 */
function finish(code) {
  const failed = results.filter(r => !r.pass)
  say('')
  say('================ 结果 ================')
  say(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}（退出码 ${code}）`)
  say(`时间：${new Date().toISOString()}`)
  try { fs.writeFileSync(REPORT, lines.join('\n') + '\n') } catch (e) { /* 连报告都写不了就只剩退出码 */ }
  app.exit(code)
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

say('================ 启动慢提示行 验证 ================')
say(`时间：${new Date().toISOString()}`)
say(`DATA_DIR：${process.env.DATA_DIR || '(未设置)'}`)

if (!process.env.DATA_DIR) {
  say('拒绝运行：未设置 DATA_DIR=<沙箱目录>（本脚本不读数据，仅为遵守沙箱红线）')
  fs.writeFileSync(REPORT, lines.join('\n') + '\n')
  process.exit(2)
}

// ===== 抽出厂 html =====
let html = ''
try {
  const mainSrc = fs.readFileSync(path.join(REPO, 'electron', 'main.js'), 'utf8')
  // ⚠️ 换行要容忍 CRLF：本仓库工作区是 core.autocrlf=true，main.js 实际是 \r\n。
  //    2026-10-14 实测：写成 `\`\n\s*splash\.loadURL` 会**一句都不匹配**，
  //    表现为「找不到模板」—— 而这是环境差异、不是代码问题。
  const m = mainSrc.match(/const html = `([\s\S]*?)`[\s\r\n]*splash\.loadURL/)
  if (!m) throw new Error('electron/main.js 里找不到闪屏 html 模板（变量名或结尾写法改了？）')
  const logoSrc = 'data:image/png;base64,' + fs.readFileSync(path.join(REPO, 'client', 'dist', 'SJK.png')).toString('base64')
  // ⚠️ 必须**求值**这个模板字面量，不能直接把源码当 HTML 写出去。
  //    2026-10-14 实测踩坑：字面量源码里写的是 `\\n`（模板求值后才是 `\n`，交给浏览器再变真换行）。
  //    不求值 ⇒ HTML 里留着 `\\n` ⇒ 浏览器解析成「字面反斜杠+n」⇒ 报告里看到 `\n` 露在界面上，
  //    看着像出厂代码有 bug，其实是验证器不忠实。这里用 new Function 走和主程序一样的求值路径。
  html = new Function('logoSrc', 'return `' + m[1] + '`')(logoSrc)
  if (html.includes('${logoSrc}')) throw new Error('模板里的 ${logoSrc} 没被替换（写法变了？）')
} catch (e) {
  say(`FAIL  抽出厂 html — ${e.message}`)
  results.push({ name: '抽出厂 html', pass: false })
  finish(2)
}

const htmlPath = path.join(__dirname, '_splash-slowstart.html')
fs.writeFileSync(htmlPath, html)
say(`  抽出厂 html：${htmlPath}（${fs.statSync(htmlPath).size} B）`)
check('抽出的是出厂那段 html（含计时脚本）', html.includes("getElementById('hint')") && html.includes('setInterval'), `长度=${html.length}`)

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 420, height: 340, frame: false, transparent: true, show: true })
    await win.loadFile(htmlPath)
    const read = () => win.webContents.executeJavaScript(`document.getElementById('hint').textContent`)
    const shot = async (tag) => {
      const img = await win.webContents.capturePage()
      const p = path.join(__dirname, `_splash-slowstart-${tag}.png`)
      fs.writeFileSync(p, img.toPNG())
      return p
    }

    await sleep(1200)
    const t1 = await read()
    check('第 1 档（<6s）=「正在启动…」', t1.includes('正在启动'), JSON.stringify(t1))

    await sleep(7800)   // ≈9s
    const t2 = await read()
    const p2 = await shot('9s')
    check('第 2 档（6~30s）=「启动较慢（已 N 秒）…请稍候」', /^启动较慢（已 \d+ 秒）…请稍候$/.test(t2), JSON.stringify(t2))
    say(`      截图 ${p2}`)

    await sleep(23000)  // ≈32s
    const t3 = await read()
    const p3 = await shot('32s')
    check('第 3 档（≥30s）点明「在等安全软件扫描」', t3.includes('安全软件扫描'), JSON.stringify(t3.slice(0, 40)))
    check('第 3 档给出日志位置（startup.log）', t3.includes('startup.log'), '')
    // 换行必须是真的换行（.hint 上 white-space:pre-line 才会断行）——
    // 若界面上真出现字面的「\n」，说明转义写多了一层，用户会看到一串反斜杠。
    check('第 3 档的换行是真换行（不是字面 \\n）', t3.includes('\n') && !t3.includes('\\n'), `含真换行=${t3.includes('\n')}`)
    const s2 = parseInt((t2.match(/已 (\d+) 秒/) || [])[1], 10)
    const s3 = parseInt((t3.match(/已 (\d+) 秒/) || [])[1], 10)
    check('秒数在真的走动（第 3 档 > 第 2 档）', s3 > s2, `${s2}s → ${s3}s`)
    say(`      截图 ${p3}`)
    finish(results.some(r => !r.pass) ? 1 : 0)
  } catch (e) {
    check('harness 执行', false, e.stack || e.message)
    finish(1)
  }
})
