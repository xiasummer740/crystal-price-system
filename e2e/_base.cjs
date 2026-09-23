/**
 * E2E 的目标地址 —— **必须显式给，没有默认值**。
 *
 * 以前三个用例各自写死 `http://localhost:3266`，而 3266 正是软件自己的生产端口。
 * 开着软件跑 `npm run test:e2e`，测试会直接往**真实数据库**里写「E2E测试-*」记录
 * （core-flow 的 afterAll 只删自己建的那些，不会误删祥哥的数据，但生产库被写脏
 * 这件事本身就不该发生）。而且三处各写一遍，改一处漏两处也没人发现。
 *
 * 所以收成这一份，并且：不设 → 拒绝跑；设成 3266 → 也拒绝跑。
 * 要跑沙箱就这么写：
 *   E2E_BASE=http://127.0.0.1:3412 npm run test:e2e
 */
const raw = process.env.E2E_BASE

if (!raw) {
  throw new Error(
    '\n  [e2e] 未设置 E2E_BASE，拒绝运行。\n' +
    '  测试会连真实数据库，必须显式指向沙箱服务，例如：\n' +
    '    E2E_BASE=http://127.0.0.1:3412 npm run test:e2e\n'
  )
}

// 3266 是软件自己的端口。真有人手滑指过来，这里直接拦住 —— 默认值没了，
// 但「显式地写错」同样会造成生产库被写脏，光去掉默认值挡不住。
let port = ''
try { port = new URL(raw).port } catch {
  throw new Error(`\n  [e2e] E2E_BASE 不是合法地址：${raw}\n`)
}
if (port === '3266') {
  throw new Error(
    '\n  [e2e] E2E_BASE 指向 3266 —— 那是软件自己的生产端口，拒绝运行。\n' +
    '  请指向沙箱服务，例如 E2E_BASE=http://127.0.0.1:3412\n'
  )
}

/** 校验通过的目标地址 */
const BASE = raw

module.exports = { BASE }
