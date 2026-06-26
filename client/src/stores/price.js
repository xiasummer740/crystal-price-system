import { defineStore } from 'pinia'
import { fetchPrices, fetchPricesGrouped, getPrice, createPrice, updatePrice, deletePrice, getMetaOptions, getColumnValues } from '../utils/api.js'

export const usePriceStore = defineStore('price', {
  state: () => ({
    list: [],
    total: 0,
    loading: false,
    current: null,
    metaOptions: { factories: [], quoters: [] },
    filters: { keyword: '', factory: '', quoter: '', currency: '', category: '', startDate: '', endDate: '', sortBy: 'created_at', sortOrder: 'DESC', page: 1, pageSize: Number(localStorage.getItem('crystal_pageSize')) || 50 },
    columnFilters: {},
    activeColumnFilters: [],
    multiFilter: ''
  }),
  getters: {
    hasColumnFilters: (state) => Object.keys(state.columnFilters).length > 0
  },
  actions: {
    async loadList(append = false) {
      this.loading = true
      try {
        const params = { ...this.filters, ...this.columnFilters }
        if (this.multiFilter) params.multiFilter = this.multiFilter
        const res = await fetchPrices(params)
        const newList = res.data.list
        // 去重：完全相同的记录只保留一条（使用不可见分隔符避免字段内容干扰）
        const deduped = []
        const seen = new Set()
        const SEP = '\x1F'
        for (const item of newList) {
          const key = [item.material_code,item.material_name,item.material_spec,item.category,item.brand,item.dimension,item.pin_count,item.frequency,item.load_cap,item.voltage,item.mode,item.freq_tol,item.price_with_tax,item.price_without_tax,item.currency,item.factory_code,item.quoter,item.standard_lead_time,item.first_inquiry_customer,item.remarks].map(v=>v??'').join(SEP)
          if (seen.has(key)) continue
          seen.add(key)
          deduped.push(item)
        }
        if (append) {
          this.list = [...this.list, ...deduped]
        } else {
          this.list = deduped
          // 仅在首次/刷新时计算去重后的总数，翻页时不变
          this.total = Math.max(0, res.data.total - (newList.length - deduped.length))
        }
      } finally {
        this.loading = false
      }
    },
    async loadGroupedList() {
      this.loading = true
      this.list = []
      try {
        const params = { ...this.filters, ...this.columnFilters, taxRate: 13, fxRate: 7.25 }
        if (this.multiFilter) params.multiFilter = this.multiFilter
        const res = await fetchPricesGrouped(params)
        this.list = res.data.list
        this.total = res.data.total
      } finally {
        this.loading = false
      }
    },
    async loadDetail(id) {
      const res = await getPrice(id)
      this.current = res.data
      return res.data
    },
    async add(data) {
      const res = await createPrice(data)
      return res.data
    },
    async edit(id, data) {
      await updatePrice(id, data)
    },
    async remove(id) {
      await deletePrice(id)
    },
    async loadMetaOptions() {
      const res = await getMetaOptions()
      this.metaOptions = res.data
    },
    async loadColumnValues(column, keyword = '') {
      return await getColumnValues(column, keyword)
    },
    setFilter(key, value) {
      this.filters[key] = value
      if (key !== 'page') this.filters.page = 1
    },
    setColumnFilter(column, value) {
      if (value) {
        this.columnFilters[column] = value
        if (!this.activeColumnFilters.find(f => f.column === column)) {
          this.activeColumnFilters.push({ column, value })
        } else {
          const idx = this.activeColumnFilters.findIndex(f => f.column === column)
          this.activeColumnFilters[idx].value = value
        }
      } else {
        delete this.columnFilters[column]
        this.activeColumnFilters = this.activeColumnFilters.filter(f => f.column !== column)
      }
      this.filters.page = 1
    },
    removeColumnFilter(column) {
      delete this.columnFilters[column]
      this.activeColumnFilters = this.activeColumnFilters.filter(f => f.column !== column)
      this.filters.page = 1
    },
    clearColumnFilters() {
      this.columnFilters = {}
      this.activeColumnFilters = []
      this.filters.page = 1
    },
    setPageSize(size) {
      this.filters.pageSize = size
      this.filters.page = 1
      localStorage.setItem('crystal_pageSize', size)
    },
    resetFilters() {
      const ps = this.filters.pageSize
      this.filters = { keyword: '', factory: '', quoter: '', currency: '', category: '', startDate: '', endDate: '', sortBy: 'created_at', sortOrder: 'DESC', page: 1, pageSize: ps }
      this.columnFilters = {}
      this.activeColumnFilters = []
    }
  }
})
