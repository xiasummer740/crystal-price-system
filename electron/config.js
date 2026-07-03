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

export function saveFullConfig(patch) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const existing = loadFullConfig()
  const payload = { ...existing, ...patch, version: 2, setAt: new Date().toISOString() }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8')
}

export function getConfigFilePath() {
  return CONFIG_FILE
}
