/**
 * 报价表格列宽拖拽（v1.0.236 回归）
 *
 * 钉住 v1.0.235 的 off-by-one：表的第 1 个 <th> 是复选框列（没有 data-col），
 * 从前用 `ths[colIndex]` 取列，拖「登记时间」实际把复选框拉成几百像素，整张表被顶出屏幕。
 * 这里模拟一次拖拽，断言：
 *   ① 复选框列的宽度完全没动；
 *   ② 被拖的 th[data-col="0"] 变宽了。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import PriceTable from '../components/PriceTable.vue'

function stubRect(el, left, width = 73) {
  // 设置过 style.width 之后要按 style 返回宽度：saveColWidths 读的是 getBoundingClientRect
  // （jsdom 没有布局，不这样桩就和真实浏览器不一致）
  el.getBoundingClientRect = () => {
    const w = parseFloat(el.style.width) || width
    return { left, width: w, right: left + w, top: 0, bottom: 30, height: 30, x: left, y: 0, toJSON() {} }
  }
}

describe('PriceTable 列宽拖拽', () => {
  beforeEach(() => localStorage.clear())

  it('拖登记时间只改这一列，复选框列保持原样', async () => {
    const wrapper = mount(PriceTable, {
      props: { list: [], total: 0, page: 1, pageSize: 50, checkedIds: [] },
      attachTo: document.body
    })
    const cbTh = wrapper.findAll('th')[0].element
    const timeTh = wrapper.find('th[data-col="0"]').element
    stubRect(timeTh, 100)
    stubRect(cbTh, 0, 32)

    await wrapper.find('th[data-col="0"] .resize-handle').trigger('mousedown')
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    expect(timeTh.style.width).toBe('160px')
    // 复选框列在模板里就是 width:32px；off-by-one 时会被改成 200+px
    expect(parseFloat(cbTh.style.width)).toBeLessThanOrEqual(40)
    wrapper.unmount()
  })

  it('拖完把宽度记进 localStorage（刷新后还在）', async () => {
    const wrapper = mount(PriceTable, {
      props: { list: [], total: 0, page: 1, pageSize: 50, checkedIds: [] },
      attachTo: document.body
    })
    const timeTh = wrapper.find('th[data-col="0"]').element
    stubRect(timeTh, 50)
    await wrapper.find('th[data-col="0"] .resize-handle').trigger('mousedown')
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 190, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    const saved = JSON.parse(localStorage.getItem('crystal_prices_colWidths') || '{}')
    expect(saved['0']).toBe(140)
    wrapper.unmount()
  })
})
