/**
 * 样品价格表头：「含税价 / 未税价」
 *
 * 背景（v1.0.231）：样品登记第二个价格字段一直叫「本价含税」，但它的值实际是
 * 「含税价 ÷ 1.13」（生产数据 0.32 → 0.2832），也就是未税价；表头/模板/导入别名
 * 三处都跟着改，旧 Excel 的「本价含税」仍要能导入（祥哥手里有旧模板）。
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import XLSX from 'xlsx'

const tmpDir = path.join(os.tmpdir(), 'crystal-sample-price-test-' + crypto.randomBytes(4).toString('hex'))
process.env.DATA_DIR = tmpDir

let db, generateSampleTemplate, exportSamples, importSamplesFromExcel

before(async () => {
  fs.mkdirSync(path.join(tmpDir, '数据库'), { recursive: true })
  db = await import('../server/src/db.js')
  await db.initDb()
  const ex = await import('../server/src/utils/export.js')
  generateSampleTemplate = ex.generateSampleTemplate
  exportSamples = ex.exportSamples
  importSamplesFromExcel = ex.importSamplesFromExcel
})

after(async () => {
  await new Promise(r => setTimeout(r, 500))
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

function headersOf(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
  return rows[0]
}

function makeXlsx(rows) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, '样品登记')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

describe('样品价格表头命名', () => {
  it('导入模板用「未税价」，不再出现「本价含税」', () => {
    const headers = headersOf(generateSampleTemplate())
    assert.ok(headers.includes('含税价'))
    assert.ok(headers.includes('未税价'))
    assert.equal(headers.includes('本价含税'), false)
  })

  it('导出样品也用「未税价」', () => {
    db.execute(`INSERT INTO material_samples (material_code, material_name, price_with_tax, cost_price)
                VALUES ('T-001', '测试料', 0.32, 0.2832)`)
    const headers = headersOf(exportSamples({}))
    assert.ok(headers.includes('未税价'))
    assert.equal(headers.includes('本价含税'), false)
  })
})

describe('导入兼容', () => {
  const get = (code) => db.queryOne('SELECT * FROM material_samples WHERE material_code = ? ORDER BY id DESC LIMIT 1', [code])

  it('新表头「未税价」能导入', () => {
    const buf = makeXlsx([
      ['物料编码', '物料名称', '含税价', '未税价'],
      ['T-101', '新表头料', '0.32', '0.2832']
    ])
    assert.equal(importSamplesFromExcel(buf), 1)
    const row = get('T-101')
    assert.equal(Number(row.price_with_tax), 0.32)
    assert.equal(Number(row.cost_price), 0.2832)
  })

  it('旧表头「本价含税」仍能导入（不能因为改名把旧 Excel 废掉）', () => {
    const buf = makeXlsx([
      ['物料编码', '物料名称', '含税价', '本价含税'],
      ['T-102', '旧表头料', '0.5', '0.4425']
    ])
    assert.equal(importSamplesFromExcel(buf), 1)
    const row = get('T-102')
    assert.equal(Number(row.price_with_tax), 0.5)
    assert.equal(Number(row.cost_price), 0.4425)
  })

  it('更早的「本价」表头也能导入', () => {
    const buf = makeXlsx([
      ['物料编码', '物料名称', '本价'],
      ['T-103', '更旧表头料', '0.25']
    ])
    assert.equal(importSamplesFromExcel(buf), 1)
    assert.equal(Number(get('T-103').cost_price), 0.25)
  })

  it('没填价格时存 NULL，不会变成 0', () => {
    const buf = makeXlsx([
      ['物料编码', '物料名称', '含税价', '未税价'],
      ['T-104', '无价料', '', '']
    ])
    assert.equal(importSamplesFromExcel(buf), 1)
    const row = get('T-104')
    assert.equal(row.price_with_tax, null)
    assert.equal(row.cost_price, null)
  })
})
