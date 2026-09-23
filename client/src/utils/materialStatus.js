/**
 * 物料状态清单的**唯一来源在服务端**（server/src/utils/materialStatus.js）。
 * 前端不再抄一份，只负责把 /api/materials/status-config 下发的配置转成显示顺序。
 *
 * 以前这里是硬编码的 ['报价','规格书','送样','下散单','下批量']：服务端加了第 6 个状态后，
 * 接口会把新状态下发过来，但筛选列表还是旧的 5 个 —— 新状态在筛选里根本看不见，且不报错。
 */

// 接口拿不到时的兜底顺序。正常情况下用不上，只为接口异常时页面不至于空掉。
export const STATUS_FALLBACK = ['报价', '规格书', '送样', '下散单', '下批量']

/** 把 status-config 下发对象 { 状态: { color, order } } 转成按业务流转排序的名字数组 */
export function statusOrderFromConfig(config) {
  const names = Object.entries(config || {})
    .sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0))
    .map(([name]) => name)
  return names.length ? names : [...STATUS_FALLBACK]
}
