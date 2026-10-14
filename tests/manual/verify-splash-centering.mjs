/**
 * 启动动画「居中是否与窗口尺寸无关」验证器
 *
 * 起因：祥哥 2026-10-14 问「窗口大小调成不一样大小时，logo 还在正中吗」。
 * logo 用的是 `top:50%;left:50%` + `translate(-50%,-50%)` 的百分比定位，
 * 理论上窗口怎么变都在正中 —— 但「理论上」不算数，这里拿**出厂那段 HTML**
 * 在多种窗口尺寸下真跑一遍，逐个量 logo 外接框中心与窗口中心的偏差。
 *
 * 同时量出卡片的实际尺寸：窗口小于卡片（324×276）时卡片会被裁掉 ——
 * 那时 logo 仍然居中，但卡片边缘会被切，这是唯一需要守的边界。
 *
 * ⚠️ electron.exe 是 GUI 程序，stdout 抓不到，报告落盘到
 *    tests/manual/_splash-centering-report.txt；退出码 0 = 全部尺寸都居中。
 *
 * 用法：
 *   $env:DATA_DIR = "D:\dsh-workspace\晶振报价软件\dev-data"   # 本脚本不读数据，仅为遵守沙箱红线
 *   .\node_modules\electron\dist\electron.exe tests\manual\verify-splash-centering.mjs
 */
import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..')
const REPORT = path.join(__dirname, '_splash-centering-report.txt')

// 覆盖：默认尺寸、更大、更小、极扁、极高，以及两种典型高分屏逻辑尺寸
const SIZES = [
  [420, 340, '默认尺寸'],
  [520, 420, '放大'],
  [360, 300, '缩小'],
  [800, 600, '大窗'],
  [1200, 800, '很大'],
  [480, 260, '很扁'],
  [340, 460, '很高'],
  [324, 276, '刚好等于卡片尺寸'],
  [300, 220, '比卡片还小（预期会裁卡片）']
]
const CARD = { w: 324, h: 276 }

const lines = []
const results = []
const say = (s) => lines.push(s)
function check(name, pass, detail = '') {
  results.push({ name, pass })
  say(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
function finish(code) {
  const failed = results.filter(r => !r.pass)
  say('')
  say('================ 结果 ================')
  say(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}（退出码 ${code}）`)
  say(`时间：${new Date().toISOString()}`)
  try { fs.writeFileSync(REPORT, lines.join('\n') + '\n') } catch { /* 只剩退出码 */ }
  app.exit(code)
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

say('================ 启动动画居中 × 窗口尺寸 验证 ================')
say(`时间：${new Date().toISOString()}`)

if (!process.env.DATA_DIR) {
  say('拒绝运行：未设置 DATA_DIR=<沙箱目录>（本脚本不读数据，仅为遵守沙箱红线）')
  fs.writeFileSync(REPORT, lines.join('\n') + '\n')
  process.exit(2)
}

// ===== 抽出厂 html（与 verify-splash-slowstart.mjs 同源同法）=====
let html = ''
try {
  const mainSrc = fs.readFileSync(path.join(REPO, 'electron', 'main.js'), 'utf8')
  const m = mainSrc.match(/const html = `([\s\S]*?)`[\s\r\n]*splash\.loadURL/)   // 容忍 CRLF
  if (!m) throw new Error('electron/main.js 里找不到闪屏 html 模板')
  const logoSrc = 'data:image/png;base64,' + fs.readFileSync(path.join(REPO, 'client', 'dist', 'SJK.png')).toString('base64')
  html = new Function('logoSrc', 'return `' + m[1] + '`')(logoSrc)   // 必须求值，别把源码当 HTML
} catch (e) {
  say(`FAIL  抽出厂 html — ${e.message}`)
  results.push({ name: '抽出厂 html', pass: false })
  finish(2)
}
const htmlPath = path.join(__dirname, '_splash-centering.html')
fs.writeFileSync(htmlPath, html)
say(`  抽出厂 html：${htmlPath}（${fs.statSync(htmlPath).size} B）`)
say('')

app.whenReady().then(async () => {
  try {
    // 只建**一个**窗口，反复改尺寸 —— 比「建窗→销毁→再建」更贴近真实（同一段页面响应不同窗口），
    // 也避开一个实测坑：销毁窗口会中止紧接着那次 loadFile（ERR_FAILED -2）。
    // backgroundThrottling:false —— 实测坑：窗口被遮挡时 Chromium 会节流动画，
    // 入场动画停在起始帧，量到的 logo 会「偏 10px」，看着像布局错、其实是量化假象。
    const win = new BrowserWindow({
      width: SIZES[0][0], height: SIZES[0][1], frame: false, transparent: true, show: true,
      webPreferences: { backgroundThrottling: false }
    })
    await win.loadFile(htmlPath)
    await sleep(1500)   // 等入场动画（logo 有 scale 动画）走完再开始量

    for (const [w, h, label] of SIZES) {
      win.setContentSize(w, h)
      await sleep(450)  // 等重排稳定
      const r = await win.webContents.executeJavaScript(`(() => {
        const img = document.querySelector('.card img');
        const card = document.querySelector('.card');
        const a = img.getBoundingClientRect(), c = card.getBoundingClientRect();
        return {
          cx: a.left + a.width / 2, cy: a.top + a.height / 2,
          iw: innerWidth, ih: innerHeight,
          cardW: c.width, cardH: c.height,
          cardLeft: c.left, cardTop: c.top, cardRight: c.right, cardBottom: c.bottom
        };
      })()`)
      const dx = Math.abs(r.cx - r.iw / 2), dy = Math.abs(r.cy - r.ih / 2)
      const clipped = r.cardLeft < -0.5 || r.cardTop < -0.5 || r.cardRight > r.iw + 0.5 || r.cardBottom > r.ih + 0.5
      say(`▶ 请求 ${w}×${h}（${label}）→ 实际视口 ${r.iw}×${r.ih}，卡片 ${r.cardW.toFixed(0)}×${r.cardH.toFixed(0)}`)
      check(`${label}：logo 水平居中 ≤1px`, dx <= 1, `偏差 ${dx.toFixed(2)}px`)
      check(`${label}：logo 垂直居中 ≤1px`, dy <= 1, `偏差 ${dy.toFixed(2)}px`)
      if (w < CARD.w || h < CARD.h) {
        check(`${label}：窗口小于卡片 ⇒ 预期卡片被裁`, clipped, clipped ? '确实被裁（logo 仍居中）' : '未被裁')
      } else {
        check(`${label}：卡片完整落在窗口内`, !clipped, clipped ? '被裁了（不该）' : '完整')
      }
      const shot = path.join(__dirname, `_splash-size-${w}x${h}.png`)
      const img = await win.webContents.capturePage()
      fs.writeFileSync(shot, img.toPNG())
    }
    win.destroy()
    say('')
    say(`  说明：卡片固定 ${CARD.w}×${CARD.h}，窗口小于它时会裁掉卡片边缘（logo 依然居中）。`)
    say('  闪屏窗口由 electron/main.js 的 showSplash() 以 420×340 创建、resizable:false，用户拖不动它。')
    finish(results.some(x => !x.pass) ? 1 : 0)
  } catch (e) {
    check('harness 执行', false, e.stack || e.message)
    finish(1)
  }
})
