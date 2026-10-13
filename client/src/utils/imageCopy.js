/**
 * 图片右键菜单的公共逻辑：把「页面上的一张图」变成能落进剪贴板 / 磁盘的 dataURL。
 *
 * 为什么统一转 PNG：
 * 系统剪贴板的图片格式各家软件认的不一样（微信、Word、画图对 jpg/gif 的支持参差），
 * 统一转成 PNG 再写剪贴板，兼容性最好。原图本身是 png 时也走这条路，只是不额外损失。
 *
 * 为什么走 URL 取图、而不是读磁盘：
 * 图片 URL 有多种形态（/api/cust/、/api/uploads/materials/… 归档前后不一样），
 * 页面上显示的那张图能显示出来，就说明这个 URL 一定能取到 —— 直接复用它的取数路径，
 * 以后归档结构再变这里也不用跟着改。
 */

/** 取图片显示用的原始文件名：优先上传时附带的 ?name=，否则回落末段文件名 */
export function guessImageName(url, fallback = '图片.png') {
  try {
    const m = String(url || '').match(/[?&]name=([^&]+)/)
    if (m) return decodeURIComponent(m[1])
    const last = String(url || '').split('?')[0].split('/').filter(Boolean).pop() || ''
    return decodeURIComponent(last) || fallback
  } catch {
    return fallback
  }
}

/** 把图片转成 PNG 的 dataURL（跨域图会失败，调用方按失败提示即可） */
export async function urlToPngDataUrl(url) {
  if (!url) throw new Error('没有图片地址')
  const res = await fetch(String(url))
  if (!res.ok) throw new Error(`图片读取失败（HTTP ${res.status}）`)
  const blob = await res.blob()
  if (!blob.size) throw new Error('图片是空文件')
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    return canvas.toDataURL('image/png')
  } finally {
    bitmap.close?.()
  }
}
