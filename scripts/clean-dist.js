// electron-builder beforePack hook: 清空 dist-exe，避免历史产物累积
import fs from 'fs'
import path from 'path'

export default async function (context) {
  const outDir = path.join(context.outDir || path.resolve('dist-exe'))
  if (!fs.existsSync(outDir)) return
  for (const entry of fs.readdirSync(outDir)) {
    const p = path.join(outDir, entry)
    try {
      if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true })
      else fs.unlinkSync(p)
    } catch (e) {
      console.warn('[clean-dist] 删除失败：', p, e.message)
    }
  }
  console.log('[clean-dist] dist-exe 已清空')
}
