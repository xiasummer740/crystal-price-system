/**
 * 客户物料的「进展流水」—— 只追加、永不覆盖。
 *
 * 背景（祥哥 2026-10-14）：「之前最早的记录是报价或送样，后面发了规格书、价格更新、下散单、
 * 下批量，改完只看到最后的结果，完全不知道之前的进度 —— 不知道什么时候开始报价的、
 * 什么时候送样的、什么时候给的规格书，之前的报价变化是什么样也不知道。」
 *
 * `customer_materials.status` 是就地覆盖的、`updated_at` 也会被后续编辑冲掉 ⇒
 * **历史追不回来**。所以这里的原则是：
 *   ① 每一步**追加**一条，绝不改写已有记录（时间线要能复现当时的顺序）；
 *   ② 只有**真的变了**才写（编辑一次没改状态就不该多出一条噪声）；
 *   ③ 写入失败不能连累主流程 —— 物料保存成功最重要，流水缺一条我们自己写日志。
 */
import { queryAll, queryOne, executeBatch, saveNow } from '../db.js'
import { warn } from './logger.js'

/** 追加一条流水（material_id 无效时静默跳过并记日志，不抛错给调用方） */
export function logEvent(materialId, type, { field = '', oldValue = '', newValue = '', note = '' } = {}) {
  const mid = Number(materialId)
  if (!Number.isInteger(mid) || mid <= 0 || !type) {
    warn('materials', `进展流水参数无效，已跳过：material_id=${materialId} type=${type}`)
    return false
  }
  try {
    executeBatch(
      `INSERT INTO material_events (material_id, type, field, old_value, new_value, note) VALUES (?, ?, ?, ?, ?, ?)`,
      [mid, type, field, String(oldValue ?? ''), String(newValue ?? ''), note]
    )
    saveNow()
    return true
  } catch (e) {
    // 流水写不进去不该让「保存物料」这件事失败 —— 但要留痕，别静默
    warn('materials', `进展流水写入失败（material_id=${mid}, type=${type}）：${e.message}`)
    return false
  }
}

/**
 * 按字段比对，把**真的变了**的东西写成流水。
 * @param {number} materialId
 * @param {object} before 修改前的行
 * @param {object} after  修改后的值（调用方给的新值）
 * @returns {Array<{type:string, field:string, oldValue:string, newValue:string}>} 写进去的那些
 */
export function logDiff(materialId, before, after) {
  // 只记业务上看得懂的字段。像 updated_at / 图片数组这种不进时间线（噪声）。
  const WATCH = [
    { field: 'status', type: 'status' },
    { field: 'price', type: 'price' },
    { field: 'cost_price', type: 'cost_price' },
    { field: 'spec_document', type: 'spec' },
    { field: 'jkx_code', type: 'code' },
    { field: 'customer_code', type: 'code' },
    { field: 'material_code', type: 'code' },
    { field: 'customer', type: 'customer' },
    { field: 'factory', type: 'factory' }
  ]
  const written = []
  for (const { field, type } of WATCH) {
    const o = String(before?.[field] ?? '')
    const n = String(after?.[field] ?? '')
    if (o === n) continue
    logEvent(materialId, type, { field, oldValue: o, newValue: n })
    written.push({ type, field, oldValue: o, newValue: n })
  }
  return written
}

/** 读取某个物料的流水（新→旧） */
export function listEvents(materialId, limit = 500) {
  return queryAll(
    'SELECT id, material_id, type, field, old_value, new_value, note, changed_at FROM material_events WHERE material_id = ? ORDER BY changed_at DESC, id DESC LIMIT ?',
    [Number(materialId), Math.max(1, Math.min(2000, Number(limit) || 500))]
  )
}

/** 统计（验证/排查用）：某个物料有多少条流水 */
export function countEvents(materialId) {
  return queryOne('SELECT COUNT(*) AS c FROM material_events WHERE material_id = ?', [Number(materialId)])?.c || 0
}
