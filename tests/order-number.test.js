import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { guessShortName, buildOrderNo, orderFileName, chineseShort, stripRegion, coreName } from '../server/src/utils/orderNumber.js'

describe('客户简称（单号前缀）', () => {
  it('去掉地区前缀：深圳市国润聚源科技 → 国润聚源', () => {
    assert.equal(stripRegion('深圳市国润聚源科技有限公司'), '国润聚源科技有限公司')
    assert.equal(coreName('深圳市国润聚源科技有限公司'), '国润聚源')
  })

  it('国润聚源 → GR、靖邦电子 → JB', () => {
    assert.equal(guessShortName('深圳市国润聚源科技有限公司'), 'GR')
    assert.equal(guessShortName('深圳市靖邦电子有限公司'), 'JB')
  })

  it('括号里的地区不算：中波动光通信（盐城）→ ZB', () => {
    assert.equal(guessShortName('中波动光通信（盐城）有限公司'), 'ZB')
  })

  it('英文名直接取字母', () => {
    assert.equal(guessShortName('SJK ELECTRONICS'), 'SJK')
  })

  it('猜不出返回空串（界面让用户手填）', () => {
    assert.equal(guessShortName(''), '')
    assert.equal(guessShortName('123'), '')
  })
})

describe('单号格式', () => {
  it('GR + 261022 + 001', () => {
    assert.equal(buildOrderNo('GR', '2026-10-22', 1), 'GR261022001')
    assert.equal(buildOrderNo('gr', '2026-10-22', 27), 'GR261022027')
    assert.equal(buildOrderNo('JB', '2025-05-27', 999), 'JB250527999')
  })

  it('序号补零/截断上限 999', () => {
    assert.equal(buildOrderNo('GR', '2026-10-22', 5), 'GR261022005')
    assert.equal(buildOrderNo('GR', '2026-10-22', 1200), 'GR261022999')
    assert.equal(buildOrderNo('GR', '2026-10-22', 0), 'GR261022001')
  })

  it('简称只留字母数字，最多 6 位', () => {
    assert.equal(buildOrderNo('g-r!', '2026-10-22', 1), 'GR261022001')
    assert.equal(buildOrderNo('ABCDEFGH', '2026-10-22', 1), 'ABCDEF261022001')
  })
})

describe('订单文件名', () => {
  it('<客户中文简称>-晶科鑫订单<订单编号>', () => {
    assert.equal(orderFileName('国润', 'GR261022002'), '国润-晶科鑫订单GR261022002.xlsx')
    assert.equal(orderFileName('靖邦', 'JB250527001'), '靖邦-晶科鑫订单JB250527001.xlsx')
    // 2/3/4 个字都行（名字长短由客户档案里的简称决定，不靠机器截断）
    assert.equal(orderFileName('奥斯普', 'ASP261022001'), '奥斯普-晶科鑫订单ASP261022001.xlsx')
    assert.equal(orderFileName('中波动光', 'ZB261022001'), '中波动光-晶科鑫订单ZB261022001.xlsx')
  })

  it('中文简称取自公司核心字号前两字', () => {
    assert.equal(chineseShort('深圳市国润聚源科技有限公司'), '国润')
    assert.equal(chineseShort('深圳市靖邦电子有限公司'), '靖邦')
    assert.equal(chineseShort('中波动光通信（盐城）有限公司'), '中波')
  })

  it('简称/单号缺失时兜底，不产生非法文件名', () => {
    assert.equal(orderFileName('', 'GR261022001'), '客户-晶科鑫订单GR261022001.xlsx')
    assert.equal(orderFileName('国润', ''), '国润-晶科鑫订单订单.xlsx')
    assert.equal(orderFileName('国/润', 'GR261022001'), '国润-晶科鑫订单GR261022001.xlsx')
  })
})
