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

/**
 * 每日一份**整库备份**（防「误操作 / 逻辑损坏」）。
 *
 * 为什么必须和 saveNow 的原子写**一起**有：原子写只防「写一半断电把文件写坏」，
 * 防不了「今天手滑把一批数据改错/合并错了」——那种情况下磁盘上的库是完好的，
 * 但没有历史副本就回不去。全公司数据都在这一个 data.db 里，只有 9/27 那次迁移前的手工备份是不够的。
 *
 * 位置：<数据目录>/备份/数据库日备/data-YYYY-MM-DD.db；保留最近 7 份，更早的自动删。
 * 时机：initDb 里**读盘之后、任何迁移/写入之前**调用 ⇒ 备的是「上一次收工时的状态」，
 *       正好是出事时想回到的那个点。
 */
function dailyDbBackup() {
  try {
    if (!fs.existsSync(dbPath)) return null          // 新库，还没东西可备
    const dir = path.join(dataDir, '备份', '数据库日备')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    // 用**本地日期**命名：与界面上看到的日期一致（UTC 会在晚上 8 点后跳到"明天"）
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const dest = path.join(dir, `data-${today}.db`)
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(dbPath, dest)
      console.log(`[db] 已生成每日数据库备份: ${dest}`)
    }
    // 只保留最近 7 份（文件名带日期，按名字排就是按时间排）
    const keep = fs.readdirSync(dir).filter(f => /^data-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort()
    for (const f of keep.slice(0, Math.max(0, keep.length - 7))) {
      try { fs.unlinkSync(path.join(dir, f)) } catch { /* 删不掉就留着，不影响主流程 */ }
    }
    return dest
  } catch (e) {
    // 备份失败不能让软件起不来；但也别静默 —— 写进日志便于排查
    console.error('[db] 每日备份失败（不影响使用）:', e.message)
    return null
  }
}

export async function initDb() {
  if (db) return db
  // 每日备份要在「读盘之后、任何迁移/写入之前」做 —— 备的是上次收工的状态
  dailyDbBackup()
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
  // 记事里可以**显式关联**当前客户的物料（祥哥 2026-10-14 需求）：
  // 「某个物料下单多少、备货多少、什么物料要送样品」—— 在记事里选到物料，数量写在结构化字段里。
  // 存 JSON 数组：[{material_id,name,jkx_code,material_code,customer_code,action,quantity,unit,remark}]
  // ⚠️ **连名字/料号一起存快照**：物料改名或被删掉之后，当时那条记事还看得懂记的是哪个料。
  // ⚠️ 与「客户物料进展时间线」的关系：时间线**只收被显式关联的记事**（用户明确要求），
  //    不关联的记事不会出现在任何物料的进展里。
  try { db.run("ALTER TABLE notes ADD COLUMN material_refs TEXT DEFAULT '[]'") } catch {}

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

  // 客户物料的**进展流水**（只追加，永不覆盖）。
  //
  // 为什么要有它：customer_materials.status 是就地覆盖的，updated_at 也会被后来的任何编辑冲掉 ——
  // 祥哥 2026-10-14 提的问题正是这个：「之前是报价、后来发规格书、再送样、再下散单，
  // 改完只看到最后结果，不知道什么时候走到哪一步」。历史上这些时间点已经追不回来了，
  // 但从这张表建好那一刻起，每一步都有据可查（还能算每个阶段停留多久）。
  //
  // type 取值：created(建档) / status(状态流转) / price(报价变化) / cost_price(成本价变化) /
  //           spec(规格书) / code(编码变更) / customer(客户名变更) / note(备注)
  // old_value/new_value 存文本，方便前端直接展示「0.452 → 0.4746」。
  db.run(`
    CREATE TABLE IF NOT EXISTS material_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      type        TEXT    NOT NULL,
      field       TEXT    DEFAULT '',
      old_value   TEXT    DEFAULT '',
      new_value   TEXT    DEFAULT '',
      note        TEXT    DEFAULT '',
      changed_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_material_events_mid ON material_events(material_id)') } catch {}
  // 兼容旧数据库：添加备注图片/文件列（JSON数组，微信粘贴报价原始记录）
  try { db.run("ALTER TABLE customer_materials ADD COLUMN remark_images TEXT DEFAULT '[]'") } catch {}

  // ====== 客户的账期 / 对账付款信息（祥哥 2026-10-15 需求）======
  // 显示在「客户物料」页头（选中的客户那一行），入口也在同一处 + 名册管理。
  // 为什么加在 customers（名册表）而不是新建一张表：**改名合并、删除保护、客户并集
  // 这三处逻辑本来就都在处理 customers** —— 放这里，合并时账期自动跟着走、并集自动包含、
  // 名册管理顺手就能编辑；新建一张表则要在这三处各加一遍，更容易漏（历史教训）。
  try { db.run("ALTER TABLE customers ADD COLUMN payment_terms TEXT DEFAULT ''") } catch {}       // 账期（预设或自填，如「月结30天」）
  try { db.run('ALTER TABLE customers ADD COLUMN statement_day INTEGER DEFAULT 0') } catch {}      // 每月对账日 1-31（0=不设）
  try { db.run('ALTER TABLE customers ADD COLUMN payment_days INTEGER DEFAULT 0') } catch {}       // 对账后多少天付款（0=不设）
  try { db.run("ALTER TABLE customers ADD COLUMN next_statement_date TEXT DEFAULT ''") } catch {}  // 手填的「下次对账日」覆写 YYYY-MM-DD（空=按每月对账日自动算）
  try { db.run("ALTER TABLE customers ADD COLUMN pay_remark TEXT DEFAULT ''") } catch {}           // 付款/对账备注
  try { db.run("ALTER TABLE customers ADD COLUMN profile_updated_at TEXT DEFAULT ''") } catch {}   // 资料最后修改时间

  // ====== 公司资料 / 开票资料库（祥哥 2026-10-15 需求）======
  // 主要存放**客户发来的**开票资料/证照（对方多半发图片、PDF、Word/Excel），
  // 也放**自己公司的**营业执照/开票资料（支持多家抬头，见 company_profiles）。
  // 文件本体在 <数据目录>/公司资料/{客户|自己公司}/<归属名>/ 下，这里只存元数据。
  db.run(`
    CREATE TABLE IF NOT EXISTS company_docs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_type  TEXT NOT NULL DEFAULT 'customer',   -- 'customer' 客户发来的 / 'self' 自己公司
      owner_name  TEXT NOT NULL DEFAULT '',           -- 客户名 或 主体名
      category    TEXT DEFAULT '',                    -- 分类：开票资料/营业执照/…
      title       TEXT DEFAULT '',                    -- 显示名（默认取原始文件名）
      file_name   TEXT DEFAULT '',                    -- 原始文件名（保留下来方便认人）
      file_path   TEXT DEFAULT '',                    -- **相对** 公司资料/ 的路径（换目录后仍有效）
      ext         TEXT DEFAULT '',
      size        INTEGER DEFAULT 0,
      mime        TEXT DEFAULT '',
      note        TEXT DEFAULT '',
      created_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_company_docs_owner ON company_docs(owner_type, owner_name)') } catch {}

  // 自己公司主体（多家抬头）：开票资料字段，一家一行
  db.run(`
    CREATE TABLE IF NOT EXISTS company_profiles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      tax_no      TEXT DEFAULT '',
      address     TEXT DEFAULT '',
      phone       TEXT DEFAULT '',
      bank        TEXT DEFAULT '',
      account     TEXT DEFAULT '',
      remark      TEXT DEFAULT '',
      is_default  INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT (datetime('now','localtime')),
      updated_at  DATETIME DEFAULT (datetime('now','localtime'))
    )
  `)

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
//
// ⚠️ 必须**原子替换**：sql.js 是「整库导出」，一次写 858KB（生产实测）。
// 直接 writeFileSync 覆盖原文件，如果正好断电/蓝屏/进程被杀，磁盘上就是一个**写了一半的库**
// —— 全公司的数据都在这一个文件里，那等于全丢。
// 做法：先写同目录的 .tmp，再 rename 覆盖（同盘 rename 是原子操作，要么旧文件、要么新文件）。
// rename 失败（杀软临时占用/目标被打开）**不能**静默丢数据 ⇒ 重试几次，仍失败就退回直接写。
export function saveNow() {
  if (!db) throw new Error('saveNow 调用时数据库尚未初始化')
  const data = Buffer.from(db.export())
  const tmp = `${dbPath}.tmp`
  try {
    fs.writeFileSync(tmp, data)
    for (let i = 0; i < 3; i++) {
      try {
        fs.renameSync(tmp, dbPath)
        return
      } catch (e) {
        if (i === 2) throw e
        // 同步阻塞一小会儿再重试：这是收尾路径，宁可慢一点也不要把数据写丢
        const until = Date.now() + 60
        while (Date.now() < until) { /* 忙等 60ms */ }
      }
    }
  } catch (e) {
    console.error('[db] 原子替换失败，退回直接写入:', e.message)
    fs.writeFileSync(dbPath, data)
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) } catch { /* 残留 tmp 无害 */ }
  }
}

