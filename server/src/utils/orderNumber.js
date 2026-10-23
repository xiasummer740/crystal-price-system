/**
 * 订单号规则（祥哥 2026-10-22 确认）：
 *
 *   公司简称 + 年月日(YYMMDD) + 3 位流水
 *   例：GR261022001（GR=国润，地区「深圳市」不算）
 *
 * 简称来源：
 *   1. 客户档案里人工保存的简称（customers.short_name）—— 优先，客户可随时改
 *   2. 没存过就按公司名猜：去掉地区前缀 / 法人后缀 / 行业词，取前两个字的拼音首字母
 *      （深圳市国润聚源科技有限公司 → 国润聚源 → GR；深圳市靖邦电子有限公司 → 靖邦 → JB）
 *   3. 猜不出来就让用户手填（界面里可改，生成时保存）
 */
import { pinyin } from 'pinyin-pro'

// 地区词：只去前缀，不参与简称（「地区不算」）
const REGION_WORDS = [
  '中国', '中华', '北京', '上海', '天津', '重庆', '广东', '广西', '江苏', '浙江', '福建', '山东',
  '河南', '湖北', '湖南', '四川', '安徽', '江西', '河北', '山西', '陕西', '辽宁', '吉林', '黑龙江',
  '云南', '贵州', '海南', '甘肃', '青海', '台湾', '内蒙古', '新疆', '西藏', '宁夏', '香港', '澳门',
  '深圳', '东莞', '广州', '珠海', '惠州', '佛山', '中山', '汕头', '江门', '肇庆', '苏州', '杭州',
  '南京', '宁波', '无锡', '常州', '昆山', '青岛', '厦门', '长沙', '武汉', '西安', '合肥', '郑州',
  '济南', '福州', '成都', '大连', '沈阳', '嘉兴', '绍兴', '温州', '泉州', '南昌', '南宁', '昆明',
  '贵阳', '石家庄', '太原', '长春', '哈尔滨', '兰州', '乌鲁木齐', '呼和浩特', '银川', '西宁', '拉萨', '海口'
]

// 法人后缀
const COMPANY_SUFFIX = /(?:股份)?(?:有限)?(?:责任)?公司$/

// 行业/组织词：不影响「公司简称」
const INDUSTRY_WORDS = [
  '科技', '电子', '实业', '贸易', '技术', '智能', '信息', '通信', '光电', '半导体', '微电子',
  '集团', '控股', '发展', '新材料', '精密', '仪器', '仪表', '电器', '机电', '自动化', '网络',
  '软件', '系统', '供应链', '商贸', '工贸', '制造', '工业', '企业管理', '管理', '咨询', '服务',
  '股份', '分公司', '厂'
]

/** 去掉括号里的内容（「中波动光通信（盐城）有限公司」里的地区） */
function stripBrackets(name) {
  return String(name || '').replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '')
}

/** 去地区前缀：广东省深圳市… 可能叠两层 */
export function stripRegion(name) {
  let s = stripBrackets(name)
  for (let i = 0; i < 3; i++) {
    const before = s
    for (const w of REGION_WORDS) {
      if (s.startsWith(w)) {
        s = s.slice(w.length).replace(/^(?:省|市|自治区|地区|特别行政区)/, '')
        break
      }
    }
    if (s === before) break
  }
  return s
}

/** 去掉法人后缀与行业词后的「核心字号」 */
export function coreName(name) {
  let s = stripRegion(name)
  s = s.replace(COMPANY_SUFFIX, '')
  for (let i = 0; i < 3; i++) {
    const before = s
    for (const w of INDUSTRY_WORDS) {
      if (s.endsWith(w) && s.length > w.length) {
        s = s.slice(0, -w.length)
        break
      }
    }
    if (s === before) break
  }
  return s || stripRegion(name)
}

/** 取前两个字的拼音首字母；猜不出来返回 ''（界面让用户填） */
export function guessShortName(name) {
  const raw = String(name || '').trim()
  if (!raw) return ''

  const core = coreName(raw)
  const chars = Array.from(core).filter(ch => /[\u4e00-\u9fff]/.test(ch)).slice(0, 2)
  if (chars.length >= 2) {
    try {
      const initials = pinyin(chars.join(''), { pattern: 'first', toneType: 'none', type: 'array' })
      const code = initials.join('').replace(/[^a-z]/gi, '').toUpperCase()
      if (code.length >= 2) return code.slice(0, 4)
    } catch { /* 下面再兜底 */ }
  }

  // 名字里本来带英文（SJK、ME…）就取第一个英文单词，而不是把整串字母拼起来
  const firstWord = (raw.match(/[A-Za-z]{2,}/) || [])[0]
  if (firstWord) return firstWord.toUpperCase().slice(0, 4)
  return ''
}

/**
 * 拼单号：GR + 261022 + 001
 * @param {string} shortName 公司简称
 * @param {string} signDate  YYYY-MM-DD
 * @param {number} seq       1~999
 */
export function buildOrderNo(shortName, signDate, seq) {
  const short = String(shortName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  const digits = String(signDate || '').replace(/\D/g, '')
  const ymd = digits.length >= 8 ? digits.slice(2, 8) : digits.slice(0, 6)
  const n = Math.min(999, Math.max(1, Number(seq) || 1))
  return `${short}${ymd}${String(n).padStart(3, '0')}`
}

/**
 * 订单文件名：<客户简称>-晶科鑫订单<订单编号>.xlsx
 * 例：国润-晶科鑫订单GR261022002.xlsx（与祥哥原来「靖邦-晶科鑫订单JB260310001.xls」同一路子）
 * 这里的「客户简称」是中文两字（国润 / 靖邦），不是单号前缀 GR。
 */
export function orderFileName(shortNameCn, orderNo) {
  const short = String(shortNameCn || '')
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 10) || '客户'
  const no = String(orderNo || '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 20)
  return `${short}-晶科鑫订单${no || '订单'}.xlsx`
}

/**
 * 文件名用的中文客户简称：取公司核心字号的前两个字。
 * 深圳市国润聚源科技有限公司 → 国润；深圳市靖邦电子有限公司 → 靖邦
 */
export function chineseShort(name) {
  const chars = Array.from(coreName(name)).filter(ch => /[\u4e00-\u9fff]/.test(ch)).slice(0, 2)
  return chars.join('')
}
