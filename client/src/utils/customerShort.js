/**
 * 客户名简称（v1.0.235）
 *
 * 联想下拉里要显示「哪些客户也用过这颗料」，但公司全名太长（深圳市国润聚源科技有限公司），
 * 一条候选里放不下两个。这里只做**显示用**的缩短（不参与任何匹配/存储）：
 *   深圳市国润聚源科技有限公司 → 国润聚源
 *   深圳市钡铼技术有限公司       → 钡铼
 * 缩不出来就原样返回，绝不返回空串。
 */
const CITY_PREFIX = /^(?:深圳|东莞|惠州|广州|佛山|中山|珠海|成都|杭州|苏州|重庆|青岛|上海|北京|天津|宁波|厦门|长沙|武汉|南京|常州|无锡|西安|合肥|福州|郑州|济南|大连|沈阳|石家庄|太原|南昌|贵阳|昆明|南宁|海口|兰州|银川|西宁|乌鲁木齐|呼和浩特|哈尔滨|长春)市?/
const COMPANY_SUFFIX = /(?:股份)?有限公司$/
const TRADE_SUFFIX = /(?:科技|电子|技术|实业|信息|智能|工业|通讯|通信|光电|微电子|仪器|仪表|自动化|系统)$/

export function shortCustomer(name) {
  const raw = String(name || '').trim()
  if (!raw) return ''
  let s = raw.replace(CITY_PREFIX, '')
  s = s.replace(COMPANY_SUFFIX, '')
  s = s.replace(TRADE_SUFFIX, '')
  // 缩没了（例如公司名只有“深圳市科技有限公司”）就退回原名
  return s || raw
}

/**
 * 生成候选右侧的客户提示：
 *   note      —— 最多两个简称 + 「+N」，放不下时 CSS 省略号
 *   noteTitle —— 完整客户名清单，鼠标悬停可看全
 */
export function customerUsageNote(customers) {
  const names = Array.isArray(customers) ? customers.filter(Boolean) : []
  if (!names.length) return { note: '', noteTitle: '' }
  const shown = names.slice(0, 2).map(shortCustomer).join('、')
  const note = `👥 ${shown}${names.length > 2 ? ` +${names.length - 2}` : ''}`
  return { note, noteTitle: `用过的客户（${names.length}）：${names.join('、')}` }
}
