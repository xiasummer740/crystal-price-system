// 一次性脚本：从 销售出.xlsx 导入客户名到 customers 表
import XLSX from 'xlsx'
import initSqlJs from 'sql.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 读取 Excel
const xlsxPath = 'F:/下载/销售出.xlsx'
if (!fs.existsSync(xlsxPath)) {
  console.error('❌ 找不到文件:', xlsxPath)
  process.exit(1)
}
const wb = XLSX.readFile(xlsxPath)
const ws = wb.Sheets[wb.SheetNames[0]]
const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log('📄 共', json.length, '行数据')

// 提取客户名
const keys = Object.keys(json[0])
const custKey = keys.find(k => k.includes('客户')) || keys[0]
const names = [...new Set(json.map(r => String(r[custKey]).trim()).filter(Boolean))]
console.log('👤 不重复客户:', names.length, '个')

// 连接数据库
const dbDir = path.join(__dirname, '..', '数据库')
const dbPath = path.join(dbDir, 'data.db')
if (!fs.existsSync(dbPath)) {
  console.error('❌ 找不到数据库:', dbPath)
  process.exit(1)
}

const SQL = await initSqlJs()
const buf = fs.readFileSync(dbPath)
const db = new SQL.Database(buf)

// 确保 customers 表存在
db.run(`
  CREATE TABLE IF NOT EXISTS customers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    source      TEXT DEFAULT 'manual',
    created_at  DATETIME DEFAULT (datetime('now','localtime'))
  )
`)

// 批量插入
let imported = 0
for (const name of names) {
  db.run('INSERT OR IGNORE INTO customers (name, source) VALUES (?, ?)', [name, 'excel'])
  if (db.getRowsModified() > 0) imported++
}

// 存盘
const data = db.export()
fs.writeFileSync(dbPath, Buffer.from(data))
console.log(`✅ 导入完成: 共 ${names.length} 个客户，新增 ${imported} 个，跳过 ${names.length - imported} 个（已存在）`)

db.close()
