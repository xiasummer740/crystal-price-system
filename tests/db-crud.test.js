import assert from 'node:assert/strict'
import { describe, it, before } from 'node:test'
import initSqlJs from 'sql.js'

let SQL, db

// 查询全部（同 db.js queryAll 实现）
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

// 查询单行（同 db.js queryOne 实现）
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params)
  return rows[0] || null
}

// 执行写入（同 db.js execute 实现，不触发文件存盘）
function execute(sql, params = []) {
  db.run(sql, params)
  const lastId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] ?? null
  return { lastInsertRowid: lastId, changes: db.getRowsModified() }
}

before(async () => {
  SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')
})

describe('database CRUD — material_prices', () => {

  it('创建表成功', () => {
    db.run(`
      CREATE TABLE IF NOT EXISTS material_prices (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at      DATETIME DEFAULT (datetime('now','localtime')),
        updated_at      DATETIME DEFAULT (datetime('now','localtime')),
        material_code   TEXT    NOT NULL,
        material_name   TEXT    NOT NULL,
        material_spec   TEXT,
        category        TEXT,
        brand           TEXT,
        dimension       TEXT,
        pin_count       TEXT,
        frequency       TEXT,
        load_cap        TEXT,
        voltage         TEXT,
        mode            TEXT,
        freq_tol        TEXT,
        price_with_tax  REAL,
        price_without_tax REAL,
        currency        TEXT    DEFAULT 'CNY',
        factory_code    TEXT,
        quoter          TEXT,
        standard_lead_time TEXT,
        spec_document   TEXT,
        first_inquiry_customer TEXT,
        remarks         TEXT,
        is_deleted      INTEGER DEFAULT 0
      )
    `)
    // 验证表存在
    const r = queryAll("SELECT name FROM sqlite_master WHERE type='table' AND name='material_prices'")
    assert.equal(r.length, 1)
    assert.equal(r[0].name, 'material_prices')
  })

  it('插入一条记录并返回 lastInsertRowid', () => {
    const r = execute(
      `INSERT INTO material_prices (material_code, material_name, material_spec, category, brand, price_with_tax, currency, factory_code, quoter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['XC-001', '32.768KHz 晶振', '3.2x1.5mm', '无源晶振', 'KDS', 0.35, 'USD', 'KDS-001', '张三']
    )
    assert.ok(r.lastInsertRowid > 0)
    assert.equal(r.changes, 1)
  })

  it('queryAll 返回所有记录', () => {
    // 插多几条
    execute(`INSERT INTO material_prices (material_code, material_name, brand, price_with_tax, currency) VALUES (?,?,?,?,?)`,
      ['XC-002', '26MHz 晶振', 'NDK', 0.52, 'USD'])
    execute(`INSERT INTO material_prices (material_code, material_name, brand, price_with_tax, currency) VALUES (?,?,?,?,?)`,
      ['XC-003', '16MHz 晶振', 'EPSON', 0.18, 'USD'])

    const rows = queryAll('SELECT * FROM material_prices ORDER BY id')
    assert.equal(rows.length, 3)
    assert.equal(rows[0].material_code, 'XC-001')
    assert.equal(rows[1].material_code, 'XC-002')
    assert.equal(rows[2].material_code, 'XC-003')
  })

  it('queryOne 返回第一行或 null', () => {
    const found = queryOne('SELECT * FROM material_prices WHERE material_code = ?', ['XC-001'])
    assert.ok(found)
    assert.equal(found.material_name, '32.768KHz 晶振')

    const missing = queryOne('SELECT * FROM material_prices WHERE material_code = ?', ['NONEXIST'])
    assert.equal(missing, null)
  })

  it('更新记录', () => {
    const r = execute("UPDATE material_prices SET price_with_tax = ?, quoter = ? WHERE material_code = ?",
      [0.42, '李四', 'XC-001'])
    assert.equal(r.changes, 1)

    const row = queryOne("SELECT price_with_tax, quoter FROM material_prices WHERE material_code = ?", ['XC-001'])
    assert.equal(row.price_with_tax, 0.42)
    assert.equal(row.quoter, '李四')
  })

  it('软删除 (is_deleted = 1)', () => {
    const r = execute("UPDATE material_prices SET is_deleted = 1 WHERE material_code = ?", ['XC-003'])
    assert.equal(r.changes, 1)

    // WHERE is_deleted = 0 过滤
    const active = queryAll('SELECT * FROM material_prices WHERE is_deleted = 0')
    const deleted = queryAll('SELECT * FROM material_prices WHERE is_deleted = 1')
    assert.equal(active.length, 2)
    assert.equal(deleted.length, 1)
    assert.equal(deleted[0].material_code, 'XC-003')
  })

  it('LIKE 搜索（关键词匹配）', () => {
    const rows = queryAll(
      "SELECT * FROM material_prices WHERE is_deleted = 0 AND (material_code LIKE ? OR material_name LIKE ?)",
      ['%XC-001%', '%XC-001%']
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].material_code, 'XC-001')
  })

  it('分页', () => {
    const page = queryAll('SELECT * FROM material_prices WHERE is_deleted = 0 ORDER BY id LIMIT ? OFFSET ?', [1, 0])
    assert.equal(page.length, 1)
    assert.equal(page[0].material_code, 'XC-001')
  })

  it('数字字段为 NULL 时正确处理', () => {
    const r = execute(
      `INSERT INTO material_prices (material_code, material_name, price_with_tax, price_without_tax)
       VALUES (?, ?, ?, ?)`,
      ['XC-004', '测试NULL价格', null, null]
    )
    assert.ok(r.lastInsertRowid > 0)
    const row = queryOne('SELECT * FROM material_prices WHERE id = ?', [r.lastInsertRowid])
    // sql.js 的 null 在 getAsObject 中映射为 null
    assert.equal(row.price_with_tax, null)
    assert.equal(row.price_without_tax, null)
  })

})

describe('database — price_logs', () => {

  it('创建 price_logs 表并插入日志', () => {
    db.run(`
      CREATE TABLE IF NOT EXISTS price_logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        material_code TEXT NOT NULL,
        record_id     INTEGER NOT NULL,
        field_name    TEXT NOT NULL,
        old_value     TEXT,
        new_value     TEXT,
        changed_at    DATETIME DEFAULT (datetime('now','localtime'))
      )
    `)

    execute("INSERT INTO price_logs (material_code, record_id, field_name, old_value, new_value) VALUES (?,?,?,?,?)",
      ['XC-001', 1, 'price_with_tax', '0.35', '0.42'])
    execute("INSERT INTO price_logs (material_code, record_id, field_name, old_value, new_value) VALUES (?,?,?,?,?)",
      ['XC-001', 1, 'quoter', '张三', '李四'])

    const logs = queryAll("SELECT * FROM price_logs WHERE material_code = ? ORDER BY id", ['XC-001'])
    assert.equal(logs.length, 2)
    assert.equal(logs[0].field_name, 'price_with_tax')
    assert.equal(logs[0].old_value, '0.35')
    assert.equal(logs[1].field_name, 'quoter')
  })

})

describe('database — material_samples', () => {

  it('创建样品表并插入', () => {
    db.run(`
      CREATE TABLE IF NOT EXISTS material_samples (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at      DATETIME DEFAULT (datetime('now','localtime')),
        updated_at      DATETIME DEFAULT (datetime('now','localtime')),
        material_code   TEXT    NOT NULL,
        material_name   TEXT    NOT NULL,
        brand           TEXT,
        price_with_tax  REAL,
        cost_price      REAL,
        stock_quantity  INTEGER DEFAULT 0
      )
    `)

    execute("INSERT INTO material_samples (material_code, material_name, brand, price_with_tax, cost_price, stock_quantity) VALUES (?,?,?,?,?,?)",
      ['SAMPLE-001', '测试样品', 'KDS', 1.50, 0.80, 100])

    const row = queryOne("SELECT * FROM material_samples WHERE material_code = ?", ['SAMPLE-001'])
    assert.equal(row.material_name, '测试样品')
    assert.equal(row.stock_quantity, 100)
  })

})
