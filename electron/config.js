// 用户配置：数据目录路径 + 窗口布局
// 位置：%APPDATA%\crystal-price-system\user-config.json
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const CONFIG_DIR = path.join(app.getPath('appData'), 'crystal-price-system')
const CONFIG_FILE = path.join(CONFIG_DIR, 'user-config.json')
// 伴生纯文本文件：UTF-16 LE + BOM，单行路径
// 给 NSIS 卸载器读取（NSIS 在中文路径上对 UTF-8 JSON 解析不稳）
const PLAIN_FILE = path.join(CONFIG_DIR, 'data-dir.txt')

// 写 UTF-16 LE + BOM 单行文件
function writePlainUtf16(filePath, text) {
  const bom = Buffer.from([0xFF, 0xFE])
  const body = Buffer.from(text, 'utf16le')
  fs.writeFileSync(filePath, Buffer.concat([bom, body]))
}

export function loadUserConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return null
  }
}

export function saveUserConfig(dataDir) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const existing = loadUserConfig() || {}
  const payload = { ...existing, dataDir, version: 2, setAt: new Date().toISOString() }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8')
  try { writePlainUtf16(PLAIN_FILE, dataDir) } catch (e) {
    console.warn('[config] 写 data-dir.txt 失败:', e.message)
  }
}

// 通用配置读写（窗口布局等）
export function loadFullConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return { version: 2 }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return { version: 2 }
  }
}

// 沙箱/开发跑（启动时显式传了 DATA_DIR）时，**不要**把配置写进用户的真实文件。
// ⚠️ 这个文件写的是**固定路径**，跟 DATA_DIR 一点关系都没有 —— 光设了 DATA_DIR
// 挡不住它，跑一次沙箱、挪一下窗口，用户真实的窗口几何就被沙箱的值覆盖了。
// 2026-09-28 对抗性复审反例 4：`update:install` 那条堵上之后，这里还有 5 个调用点漏着。
let _ephemeral = false
export function setEphemeralConfig(v) { _ephemeral = !!v }

export function saveFullConfig(patch) {
  if (_ephemeral) return   // 沙箱跑：窗口布局是临时的，别写进真实配置
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const existing = loadFullConfig()
  const payload = { ...existing, ...patch, version: 2, setAt: new Date().toISOString() }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8')
}

export function getConfigFilePath() {
  return CONFIG_FILE
}
