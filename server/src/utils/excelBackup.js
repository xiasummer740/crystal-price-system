// Excel 自动备份：报价记录、样品登记每次写操作触发一次
// - 5 秒节流：连续写操作只在窗口结束后写 1 份，避免硬盘 I/O 风暴
// - FIFO 保留 5 份滚动
import path from 'path'
import fs from 'fs'
import { exportToExcel, exportSamples, exportNotes } from './export.js'

const THROTTLE_MS = 5 * 1000
const KEEP = 5

const state = {
  prices: { pending: false, timer: null, lastFlush: 0 },
  samples: { pending: false, timer: null, lastFlush: 0 },
  notes: { pending: false, timer: null, lastFlush: 0 }
}

function ts() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

function backupDir() {
  const dataDir = process.env.DATA_DIR
  if (!dataDir) return null
  const dir = path.join(dataDir, 'Excel备份')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function pruneFifo(dir, prefix) {
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.xlsx'))
    .sort()
  while (files.length > KEEP) {
    const f = files.shift()
    try { fs.unlinkSync(path.join(dir, f)) } catch {}
  }
}

function doFlush(type) {
  const dir = backupDir()
  if (!dir) return
  try {
    const stamp = ts()
    if (type === 'prices') {
      const buf = exportToExcel({})
      const prefix = '报价记录-自动备份-'
      fs.writeFileSync(path.join(dir, `${prefix}${stamp}.xlsx`), buf)
      pruneFifo(dir, prefix)
    } else if (type === 'samples') {
      const buf = exportSamples({})
      const prefix = '样品登记-自动备份-'
      fs.writeFileSync(path.join(dir, `${prefix}${stamp}.xlsx`), buf)
      pruneFifo(dir, prefix)
    } else if (type === 'notes') {
      const buf = exportNotes({})
      const prefix = '记事便签-自动备份-'
      fs.writeFileSync(path.join(dir, `${prefix}${stamp}.xlsx`), buf)
      pruneFifo(dir, prefix)
    }
  } catch (e) {
    console.warn(`[excelBackup] ${type} 备份失败:`, e.message)
  }
}

// 节流触发：写操作发生 → 标记 pending → 5 秒窗口结束后落盘
// 窗口期内反复触发只重置定时器，最终只写 1 份
export function triggerBackup(type) {
  if (type !== 'prices' && type !== 'samples' && type !== 'notes') return
  const st = state[type]
  st.pending = true
  if (st.timer) clearTimeout(st.timer)
  st.timer = setTimeout(() => {
    st.timer = null
    st.pending = false
    st.lastFlush = Date.now()
    doFlush(type)
  }, THROTTLE_MS)
}

// 进程退出前同步落盘任何挂起的备份
export function flushPending() {
  for (const type of ['prices', 'samples', 'notes']) {
    const st = state[type]
    if (st.timer) {
      clearTimeout(st.timer)
      st.timer = null
    }
    if (st.pending) {
      st.pending = false
      doFlush(type)
    }
  }
}
