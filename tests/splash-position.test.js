/**
 * 闪屏位置纯函数单测（node:test，不需要 Electron）
 *
 * 守的是什么：闪屏必须出现在**主界面窗口将要出现的那块地方的正中间**
 * （祥哥 2026-10-14 要求，之前是永远钉在屏幕正中）。
 *
 * 为什么用纯 Node 而不是起真 Electron：项目铁则 —— 坐标这类逻辑的对照实验
 * 写成纯 Node 探针，不许起真 Electron 去凑（真机验证留给 verify-splash-cdp.mjs，
 * 那里验的是「真启动时闪屏窗口的 screenX/screenY 和主窗口中心是否一致」）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSplashPosition } from '../electron/splashPosition.js'

const SPLASH = { w: 420, h: 340 }
const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 }

test('有保存坐标时：闪屏中心 == 主窗口中心', () => {
  // 生产机上的真实值（startup.log 的 "Window bounds: 109,113 1400x900"）
  const pos = computeSplashPosition({
    savedBounds: { x: 109, y: 113, width: 1400, height: 900 },
    splashSize: SPLASH,
    primaryWorkArea: PRIMARY
  })
  const mainCx = 109 + 1400 / 2   // 809
  const mainCy = 113 + 900 / 2    // 563
  assert.equal(pos.x + SPLASH.w / 2, mainCx)
  assert.equal(pos.y + SPLASH.h / 2, mainCy)
  assert.deepEqual(pos, { x: 599, y: 393 })
})

test('主窗口被挪到副屏（负坐标）也照样对齐', () => {
  const pos = computeSplashPosition({
    savedBounds: { x: -1920, y: 0, width: 1400, height: 900 },
    splashSize: SPLASH,
    primaryWorkArea: PRIMARY
  })
  assert.equal(pos.x + SPLASH.w / 2, -1920 + 700)
  assert.equal(pos.y + SPLASH.h / 2, 450)
})

test('没有保存坐标（首次启动）⇒ 用主显示器工作区正中（与主窗口默认居中一致）', () => {
  const pos = computeSplashPosition({ savedBounds: undefined, splashSize: SPLASH, primaryWorkArea: PRIMARY })
  assert.equal(pos.x + SPLASH.w / 2, 960)
  assert.equal(pos.y + SPLASH.h / 2, 520)
})

test('坐标被 sanitizeBounds 丢弃（只剩宽高）⇒ 同样退回主显示器正中', () => {
  const pos = computeSplashPosition({
    savedBounds: { width: 1400, height: 900 },   // 没有 x/y
    splashSize: SPLASH,
    primaryWorkArea: PRIMARY
  })
  assert.deepEqual(pos, { x: 750, y: 350 })
})

test('宽高缺失时按主窗口默认尺寸 1400x900 算中心', () => {
  const pos = computeSplashPosition({
    savedBounds: { x: 0, y: 0 },
    splashSize: SPLASH,
    primaryWorkArea: PRIMARY
  })
  assert.equal(pos.x + SPLASH.w / 2, 700)
  assert.equal(pos.y + SPLASH.h / 2, 450)
})

test('连主显示器信息都没有 ⇒ 返回空对象，交给 Electron 自己居中（不抛错）', () => {
  assert.deepEqual(computeSplashPosition({ savedBounds: undefined, splashSize: SPLASH }), {})
  assert.deepEqual(computeSplashPosition({ savedBounds: { x: NaN, y: NaN }, splashSize: SPLASH }), {})
})

test('坐标是整数（避免半像素导致窗口位置抖动）', () => {
  const pos = computeSplashPosition({
    savedBounds: { x: 101, y: 103, width: 1401, height: 901 },
    splashSize: SPLASH,
    primaryWorkArea: PRIMARY
  })
  assert.ok(Number.isInteger(pos.x) && Number.isInteger(pos.y), `得到 ${JSON.stringify(pos)}`)
})
