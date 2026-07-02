import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePriceStore } from '../stores/price.js'

// mock API 模块
vi.mock('../utils/api.js', () => ({
  fetchPrices: vi.fn(() => Promise.resolve({ code: 0, data: { list: [], total: 0 } })),
  fetchPricesGrouped: vi.fn(() => Promise.resolve({ code: 0, data: [] })),
  getPrice: vi.fn(() => Promise.resolve({ code: 0, data: null })),
  createPrice: vi.fn(() => Promise.resolve({ code: 0, data: { id: 999 } })),
  updatePrice: vi.fn(() => Promise.resolve({ code: 0 })),
  deletePrice: vi.fn(() => Promise.resolve({ code: 0 })),
  getMetaOptions: vi.fn(() => Promise.resolve({ code: 0, data: [] })),
  getColumnValues: vi.fn(() => Promise.resolve({ code: 0, data: [] })),
}))

import * as api from '../utils/api.js'

describe('PriceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('初始状态正确', () => {
    const store = usePriceStore()
    expect(store.list).toEqual([])
    expect(store.total).toBe(0)
    expect(store.loading).toBe(false)
    expect(store.filters.page).toBe(1)
    expect(store.filters.pageSize).toBe(50)
  })

  it('loadList 调用 API 并更新状态', async () => {
    const mockData = { list: [{ id: 1, material_name: '测试' }], total: 1 }
    vi.mocked(api.fetchPrices).mockResolvedValueOnce({ code: 0, data: mockData })

    const store = usePriceStore()
    await store.loadList()

    expect(api.fetchPrices).toHaveBeenCalledTimes(1)
    expect(store.list).toEqual(mockData.list)
    expect(store.total).toBe(1)
    expect(store.loading).toBe(false)
  })

  it('add 调用 API 并返回新记录 ID', async () => {
    const newRecord = { material_name: '新增测试', price_with_tax: '1.23' }

    const store = usePriceStore()
    const result = await store.add(newRecord)

    expect(api.createPrice).toHaveBeenCalledWith(newRecord)
    expect(result).toEqual({ id: 999 })
  })
})
