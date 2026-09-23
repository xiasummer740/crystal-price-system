/**
 * 分页参数归一。
 * 手敲 URL 传 page=abc / pageSize=2.5 / pageSize=-1 时，Number() 会得到 NaN 或负数，
 * 绑进 `LIMIT ?` 会让 sql.js 抛异常 → 整个列表接口 500。
 * 这里统一兜住：非法值退回默认，并给 pageSize 设上限防止一次拉爆内存。
 */
export function pageParams(query = {}, { defaultSize = 50, maxSize = 500 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const size = parseInt(query.pageSize, 10) || defaultSize
  const pageSize = Math.min(maxSize, Math.max(1, size))
  return { page, pageSize, offset: (page - 1) * pageSize }
}
