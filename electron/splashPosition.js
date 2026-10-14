/**
 * 闪屏该出现在屏幕的什么位置 —— 纯函数，不 import electron。
 *
 * 祥哥 2026-10-14 的原话：「启动动画 logo 我不是要在电脑屏幕中间，是要在软件的窗口正中间」，
 * 追问后确认：**闪屏要出现在「主界面窗口将要出现」的那块地方的正中间**，
 * 而不是像以前那样永远钉在屏幕正中（`center: true`）。
 * 以前的问题：主窗口记忆位置是 109,113 1400x900，闪屏却出现在屏幕中心，
 * 两者垂直差约 213px —— 用户把软件拖到别处时，闪屏会跳到屏幕中间，看着很割裂。
 *
 * 为什么抽成纯函数：坐标逻辑要能**用纯 Node 单测**覆盖（含「保存坐标跑到显示器外」
 * 这类没法在真机上安全复现的分支）。项目铁则：不许起真 Electron 去凑对照实验。
 */

const DEFAULT_MAIN_W = 1400   // 与 createWindow 里 saved.width || 1400 保持一致
const DEFAULT_MAIN_H = 900

/**
 * @param {{ savedBounds?: {x?:number,y?:number,width?:number,height?:number} }} p
 *        主窗口「将要使用」的坐标 —— 必须已经过 sanitizeBounds 校验（跑出所有显示器的坐标会被丢弃）
 * @param {{ w:number, h:number }} p.splashSize 闪屏窗口尺寸
 * @param {{ x:number,y:number,width:number,height:number }} [p.primaryWorkArea]
 *        主显示器工作区：主窗口没有可用保存坐标时（首次启动 / 坐标被丢弃），它会被 Electron 居中，
 *        所以闪屏也跟着居中原生默认位置，两者才一致
 * @returns {{ x?:number, y?:number }} 都取不到时返回空对象，交给 Electron 自己居中
 */
export function computeSplashPosition({ savedBounds, splashSize, primaryWorkArea }) {
  const w = Number(savedBounds?.width) > 0 ? Number(savedBounds.width) : DEFAULT_MAIN_W
  const h = Number(savedBounds?.height) > 0 ? Number(savedBounds.height) : DEFAULT_MAIN_H

  let cx
  let cy
  if (Number.isFinite(savedBounds?.x) && Number.isFinite(savedBounds?.y)) {
    // 主窗口外框的中心。注意：外框比内容区高一个标题栏（约 31px），
    // 所以闪屏会比「内容区正中」略高约 15px —— 这是有意取外的，闪屏对的是窗口而不是内容区。
    cx = Number(savedBounds.x) + w / 2
    cy = Number(savedBounds.y) + h / 2
  } else if (primaryWorkArea && Number.isFinite(primaryWorkArea.x)) {
    cx = primaryWorkArea.x + primaryWorkArea.width / 2
    cy = primaryWorkArea.y + primaryWorkArea.height / 2
  } else {
    return {}
  }

  return {
    x: Math.round(cx - splashSize.w / 2),
    y: Math.round(cy - splashSize.h / 2)
  }
}
