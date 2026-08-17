import initSqlJs from 'sql.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Electron 打包后用用户数据目录（asar 只读），开发模式用 server 同级目录
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..')
const dbDir = path.join(dataDir, '数据库')
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
const dbPath = path.join(dbDir, 'data.db')

let SQL = null
let db = null

export async function initDb() {
  if (db) return db
  // 用 locateFile 指定 WASM 路径，确保 Electron 打包后也能找到
  let wasmDir = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist')
  // asarUnpack 解包后，WASM 文件在 .asar.unpacked 目录下
  if (wasmDir.includes('.asar') && !wasmDir.includes('.asar.unpacked')) wasmDir = wasmDir.replace('.asar', '.asar.unpacked')
  SQL = await initSqlJs({ locateFile: (file) => path.join(wasmDir, file) })

  // 从文件加载已有数据库，否则创建新库
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS material_prices (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at               DATETIME DEFAULT (datetime('now','localtime')),
      updated_at               DATETIME DEFAULT (datetime('now','localtime')),
      material_code            TEXT    NOT NULL,
      material_name            TEXT    NOT NULL,
      material_spec            TEXT,
      category                 TEXT,
      brand                    TEXT,
      dimension                TEXT,
      pin_count                TEXT,
      frequency                TEXT,
      load_cap                 TEXT,
      voltage                  TEXT,
      mode                     TEXT,
      freq_tol                 TEXT,
      price_with_tax           REAL,
      price_without_tax        REAL,
      currency                 TEXT    DEFAULT 'CNY',
      factory_code             TEXT,
      quoter                   TEXT,
      standard_lead_time       TEXT,
      spec_document            TEXT,
      first_inquiry_customer   TEXT,
      remarks                  TEXT,
      is_deleted               INTEGER DEFAULT 0
    )
  `)

  // 兼容旧数据库：添加最小包装列
  try { db.run('ALTER TABLE material_prices ADD COLUMN min_package TEXT') } catch {}
  // 兼容旧数据库：添加温度列
  try { db.run('ALTER TABLE material_prices ADD COLUMN temperature TEXT') } catch {}
  // 兼容旧数据库：添加备注图片列（JSON 数组：报价备注里粘贴的图片/文件 URL 列表）
  try { db.run("ALTER TABLE material_prices ADD COLUMN remark_images TEXT DEFAULT '[]'") } catch {}

  // 兼容旧数据库：重命名采购员为报价人
  try { db.run('ALTER TABLE material_prices RENAME COLUMN purchaser TO quoter') } catch {}
  // 兼容旧数据库：添加6个物料技术参数列
  try { db.run('ALTER TABLE material_prices ADD COLUMN brand TEXT') } catch {}
  try { db.run('ALTER TABLE material_prices ADD COLUMN dimension TEXT') } catch {}
  try { db.run('ALTER TABLE material_prices ADD COLUMN pin_count TEXT') } catch {}
  try { db.run('ALTER TABLE material_prices ADD COLUMN frequency TEXT') } catch {}
  try { db.run('ALTER TABLE material_prices ADD COLUMN load_cap TEXT') } catch {}
  try { db.run('ALTER TABLE material_prices ADD COLUMN voltage TEXT') } catch {}
  try { db.run('ALTER TABLE material_prices ADD COLUMN mode TEXT') } catch {}
  try { db.run('ALTER TABLE material_prices ADD COLUMN freq_tol TEXT') } catch {}

  // 创建索引
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_material_code ON material_prices(material_code)',
    'CREATE INDEX IF NOT EXISTS idx_material_name ON material_prices(material_name)',
    'CREATE INDEX IF NOT EXISTS idx_factory ON material_prices(factory_code)',
    'CREATE INDEX IF NOT EXISTS idx_quoter ON material_prices(quoter)',
    'CREATE INDEX IF NOT EXISTS idx_customer ON material_prices(first_inquiry_customer)',
    'CREATE INDEX IF NOT EXISTS idx_created_at ON material_prices(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_deleted ON material_prices(is_deleted)'
  ]
  for (const idx of indexes) {
    try { db.run(idx) } catch {}
  }

  // 价格变更日志
  db.run(`CREATE TABLE IF NOT EXISTS price_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, material_code TEXT NOT NULL, record_id INTEGER NOT NULL, field_name TEXT NOT NULL, old_value TEXT, new_value TEXT, changed_at DATETIME DEFAULT (datetime('now','localtime')))`)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_price_logs_code ON price_logs(material_code)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_price_logs_rid ON price_logs(record_id)') } catch {}

  // 样品登记表
  db.run(`
    CREATE TABLE IF NOT EXISTS material_samples (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at        DATETIME DEFAULT (datetime('now','localtime')),
      updated_at        DATETIME DEFAULT (datetime('now','localtime')),
      material_code     TEXT    NOT NULL,
      material_name     TEXT    NOT NULL,
      material_spec     TEXT,
      brand             TEXT,
      dimension         TEXT,
      pin_count         TEXT,
      frequency         TEXT,
      load_cap          TEXT,
      voltage           TEXT,
      mode              TEXT,
      freq_tol          TEXT,
      price_with_tax    REAL,
      cost_price        REAL,
      factory_code      TEXT,
      stock_quantity    INTEGER DEFAULT 0,
      spec_document     TEXT,
      remarks           TEXT,
      is_deleted        INTEGER DEFAULT 0
    )
  `)
  // 兼容旧数据库：添加温度列
  try { db.run('ALTER TABLE material_samples ADD COLUMN temperature TEXT') } catch {}

  // 记事便签 — 事项类型
  db.run(`
    CREATE TABLE IF NOT EXISTS note_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      color       TEXT DEFAULT '#1989fa',
      sort_order  INTEGER DEFAULT 0,
      is_deleted  INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  // 预设事项类型
  const catCount = queryOne('SELECT COUNT(*) as c FROM note_categories')?.c ?? 0
  if (catCount === 0) {
    const defaults = ['报价', '订单', '交期', '来料检验', '样品']
    defaults.forEach((name, i) => executeBatch('INSERT INTO note_categories (name, color, sort_order) VALUES (?,?,?)', [name, '#1989fa', i]))
    saveNow()
  }

  // 记事便签
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      content         TEXT DEFAULT '',
      customer        TEXT DEFAULT '',
      category_id     INTEGER DEFAULT 0,
      images          TEXT DEFAULT '[]',
      reminder_at     DATETIME,
      is_reminded     INTEGER DEFAULT 0,
      priority        INTEGER DEFAULT 2,
      status          TEXT DEFAULT 'todo',
      is_pinned       INTEGER DEFAULT 0,
      is_deleted      INTEGER DEFAULT 0,
      created_at      DATETIME DEFAULT (datetime('now','localtime')),
      updated_at      DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_notes_customer ON notes(customer)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category_id)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_notes_reminder ON notes(reminder_at, is_reminded)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(is_deleted)') } catch {}
  try { db.run("ALTER TABLE notes ADD COLUMN updates TEXT DEFAULT '[]'") } catch {}

  // 客户名库（Excel 导入 + 手动录入，去重）
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      source      TEXT DEFAULT 'manual',
      created_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)') } catch {}

  // ====== 地图地址模块（5张表） ======

  // 客户位置（独立于 customers 表，带坐标和联系方式）
  db.run(`
    CREATE TABLE IF NOT EXISTS map_customers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      phone       TEXT DEFAULT '',
      address     TEXT DEFAULT '',
      latitude    REAL,
      longitude   REAL,
      notes       TEXT DEFAULT '',
      source      TEXT DEFAULT 'manual',
      created_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_map_customers_name ON map_customers(name)') } catch {}

  // 采购联系人
  db.run(`
    CREATE TABLE IF NOT EXISTS map_purchasers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      name        TEXT NOT NULL,
      phone       TEXT DEFAULT '',
      title       TEXT DEFAULT '',
      address     TEXT DEFAULT '',
      notes       TEXT DEFAULT '',
      created_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('ALTER TABLE map_purchasers ADD COLUMN address TEXT DEFAULT ""') } catch {}  // 兼容旧表
  try { db.run('CREATE INDEX IF NOT EXISTS idx_map_purchasers_cid ON map_purchasers(customer_id)') } catch {}

  // 收件地址
  db.run(`
    CREATE TABLE IF NOT EXISTS map_addresses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id   INTEGER NOT NULL,
      purchaser_id  INTEGER DEFAULT 0,
      label         TEXT DEFAULT '',
      address       TEXT NOT NULL,
      contact_name  TEXT DEFAULT '',
      contact_phone TEXT DEFAULT '',
      latitude      REAL,
      longitude     REAL,
      is_default    INTEGER DEFAULT 0,
      notes         TEXT DEFAULT '',
      created_at    DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_map_addresses_cid ON map_addresses(customer_id)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_map_addresses_pid ON map_addresses(purchaser_id)') } catch {}

  // 收货点（厂区/代工厂/仓库 — 客户下的实际收件地）
  db.run(`
    CREATE TABLE IF NOT EXISTS map_sites (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id     INTEGER NOT NULL,
      name            TEXT NOT NULL,
      site_type       TEXT DEFAULT 'office',
      address         TEXT DEFAULT '',
      latitude        REAL,
      longitude       REAL,
      contact_name    TEXT DEFAULT '',
      contact_phone   TEXT DEFAULT '',
      is_default      INTEGER DEFAULT 0,
      notes           TEXT DEFAULT '',
      created_at      DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_map_sites_cid ON map_sites(customer_id)') } catch {}

  // 兼容旧数据库：给联系人加默认收货点字段
  try { db.run('ALTER TABLE map_purchasers ADD COLUMN default_site_id INTEGER DEFAULT 0') } catch {}

  // 迁移旧地址 → 收货点：将无关联采购的地址转为收货点
  try {
    const addrCount = queryOne("SELECT COUNT(*) as c FROM map_addresses WHERE purchaser_id = 0 OR purchaser_id IS NULL")?.c ?? 0
    if (addrCount > 0) {
      const oldAddrs = queryAll("SELECT * FROM map_addresses WHERE (purchaser_id = 0 OR purchaser_id IS NULL) AND customer_id NOT IN (SELECT customer_id FROM map_sites)")
      for (const a of oldAddrs) {
        const siteName = a.label || '默认收货点'
        const exists = queryOne("SELECT id FROM map_sites WHERE customer_id = ? AND name = ?", [a.customer_id, siteName])
        if (!exists) {
          executeBatch(
            `INSERT INTO map_sites (customer_id, name, site_type, address, latitude, longitude, contact_name, contact_phone, is_default, notes)
             VALUES (?, ?, 'office', ?, ?, ?, ?, ?, ?, ?)`,
            [a.customer_id, siteName, a.address, a.latitude, a.longitude, a.contact_name, a.contact_phone, a.is_default, a.notes]
          )
        }
      }
      // 迁移完成后立即存盘
      if (addrCount > 0) { try { saveNow() } catch {} }
    }
  } catch {}

  // 行程规划
  db.run(`
    CREATE TABLE IF NOT EXISTS map_trip_plans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date   TEXT NOT NULL,
      title       TEXT DEFAULT '',
      notes       TEXT DEFAULT '',
      created_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_map_trip_plans_date ON map_trip_plans(plan_date)') } catch {}

  // 行程点
  db.run(`
    CREATE TABLE IF NOT EXISTS map_trip_points (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id       INTEGER NOT NULL,
      sort_order    INTEGER DEFAULT 0,
      customer_id   INTEGER,
      address_id    INTEGER,
      customer_name TEXT NOT NULL,
      address       TEXT DEFAULT '',
      latitude      REAL,
      longitude     REAL,
      contact_name  TEXT DEFAULT '',
      contact_phone TEXT DEFAULT '',
      notes         TEXT DEFAULT '',
      created_at    DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_map_trip_points_pid ON map_trip_points(plan_id)') } catch {}

  // ====== 绩效明细表 ======
  db.run(`
    CREATE TABLE IF NOT EXISTS performance_reviews (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      month           TEXT NOT NULL,
      employee_name   TEXT DEFAULT '',
      department      TEXT DEFAULT '',
      position        TEXT DEFAULT '',
      scores          TEXT DEFAULT '{}',
      deductions      TEXT DEFAULT '[]',
      total_score     REAL DEFAULT 0,
      created_at      DATETIME DEFAULT (datetime('now','localtime')),
      updated_at      DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_perf_month ON performance_reviews(month)') } catch {}
  // 移除旧版添加的唯一索引（避免保存冲突）
  try { db.run('DROP INDEX IF EXISTS idx_perf_month_emp') } catch {}

  // 应用设置表（Key-Value 持久化，跨升级保留）
  db.run(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT DEFAULT '')`)

  // ====== 客户物料表 ======
  db.run(`
    CREATE TABLE IF NOT EXISTS customer_materials (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at      DATETIME DEFAULT (datetime('now','localtime')),
      updated_at      DATETIME DEFAULT (datetime('now','localtime')),
      date            TEXT DEFAULT '',
      customer_code   TEXT DEFAULT '',
      jkx_code        TEXT DEFAULT '',
      price           TEXT DEFAULT '',
      cost_price      TEXT DEFAULT '',
      material_code   TEXT DEFAULT '',
      material_name   TEXT DEFAULT '',
      factory         TEXT DEFAULT '',
      status          TEXT DEFAULT '报价',
      customer_desc   TEXT DEFAULT '',
      remark          TEXT DEFAULT '',
      alternates      TEXT DEFAULT '[]',
      spec_document   TEXT DEFAULT '',
      is_deleted      INTEGER DEFAULT 0
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_materials_customer_code ON customer_materials(customer_code)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_materials_jkx_code ON customer_materials(jkx_code)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_materials_status ON customer_materials(status)') } catch {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_materials_deleted ON customer_materials(is_deleted)') } catch {}
  // 兼容旧数据库：添加客户名列
  try { db.run("ALTER TABLE customer_materials ADD COLUMN customer TEXT DEFAULT ''") } catch {}
  // 兼容旧数据库：添加备选物料/工厂列（JSON数组：[{material_name, factory}]）
  try { db.run("ALTER TABLE customer_materials ADD COLUMN alternates TEXT DEFAULT '[]'") } catch {}
  // 兼容旧数据库：添加规格书列
  try { db.run("ALTER TABLE customer_materials ADD COLUMN spec_document TEXT DEFAULT ''") } catch {}
  // 兼容旧数据库：添加备注图片/文件列（JSON数组，微信粘贴报价原始记录）
  try { db.run("ALTER TABLE customer_materials ADD COLUMN remark_images TEXT DEFAULT '[]'") } catch {}

  return db
}

// 执行查询返回对象数组（模拟 better-sqlite3 的 .all()）
export function queryAll(sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

// 执行查询返回单行
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params)
  return rows[0] || null
}

let saveDirty = false
let saveTimer = null
function scheduleSave() {
  if (saveDirty) return
  saveDirty = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveDirty = false; try { saveNow() } catch (e) { console.error('save error:', e) } }, 300)
}

// 执行写入语句，返回 { changes, lastInsertRowid }
export function execute(sql, params = []) {
  db.run(sql, params)
  const lastId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] ?? null
  scheduleSave()
  return { lastInsertRowid: lastId, changes: db.getRowsModified() }
}

// 批量写入（不在每次调用后存盘，调用者需要在循环结束后手动 saveNow）
export function executeBatch(sql, params = []) {
  db.run(sql, params)
  const lastId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] ?? null
  return { lastInsertRowid: lastId, changes: db.getRowsModified() }
}

// 立即保存到磁盘（数据库未初始化时抛错而非静默跳过）
export function saveNow() {
  if (!db) throw new Error('saveNow 调用时数据库尚未初始化')
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

