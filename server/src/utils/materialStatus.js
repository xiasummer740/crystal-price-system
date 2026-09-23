import { warn } from './logger.js'

/**
 * 物料状态清单 —— 全系统唯一来源。
 *
 * 以前这份清单在四处各抄了一遍（路由的 STATUS_CONFIG、导出的 STATUS_FILL、
 * 前端 Materials.vue / MobileMaterials.vue 的 STATUS_ORDER）。今天 5 个状态四份副本
 * 刚好都对得上，但**加第 6 个状态时不会有任何报错**：导出静静不上色、前端筛选里也看不到。
 * 现在统一从这里读 —— 服务端经 /api/materials/status-config 下发给前端，导出按 color 算配色。
 *
 * color —— 界面标签色，同时也是导出的配色种子：导出不再单独配一套颜色，
 *          整行淡色 = 这个色按 15% 掺白（整行逐格铺满、同一个色，没有特殊格）。
 *          于是软件里看到的和导出表里的是同一套色，不会两处各改各的、慢慢走偏。
 *          取值是 Ant Design 标准色：色相分离明显、色弱友好、白底可读
 *          （询价冷 → 规格蓝紫 → 送样青 → 散单橙 → 批量绿）。
 * order —— 业务流转顺序。排序用它，不是按汉字编码 ——
 *          否则排出来跟生命周期/颜色阶完全无关，用户点了会以为是 bug。
 */
export const STATUS_CONFIG = {
  '报价':   { color: '#1677ff', order: 0 },
  '规格书': { color: '#722ed1', order: 1 },
  '送样':   { color: '#13c2c2', order: 2 },
  '下散单': { color: '#fa8c16', order: 3 },
  '下批量': { color: '#52c41a', order: 4 }
}

// 往白里掺，掺完补成 Excel 要的 8 位 ARGB（#1677ff → FFDCEBFF）。
// 整行铺色必须够淡 —— 单元格里是黑字，底色一浓就看不清了，
// 所以界面标签那种饱和色不能直接铺整行，得先稀释。
function tint(hex, ratio) {
  const c = String(hex).slice(1)
  const mix = i => Math.round(parseInt(c.slice(i, i + 2), 16) * ratio + 255 * (1 - ratio))
  return 'FF' + [0, 2, 4].map(i => mix(i).toString(16).padStart(2, '0')).join('').toUpperCase()
}

// 状态不在清单里（新加了状态却忘了登记）时退回中性灰**并写日志** ——
// 宁可颜色难看，也不能静默不上色（那正是这份清单收敛之前的老毛病）。
function colorOf(status) {
  const hex = STATUS_CONFIG[status]?.color
  if (hex) return hex
  warn('export', `状态「${status}」不在状态清单里，导出配色已用中性灰兜底`,
    '请在 server/src/utils/materialStatus.js 补上')
  return '#999999'
}

/** 整行铺的淡色（ARGB）；状态为空返回 null —— 空状态的行不该整行铺色 */
export function rowFillOf(status) {
  return status ? tint(colorOf(status), 0.15) : null
}
