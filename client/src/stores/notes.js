import { defineStore } from 'pinia'
import { fetchNotes, getNote, createNote, updateNote, deleteNote, fetchCategories } from '../utils/api.js'

export const useNotesStore = defineStore('notes', {
  state: () => ({
    list: [],
    total: 0,
    loading: false,
    current: null,
    categories: [],
    filters: {
      page: 1,
      pageSize: 50,
      keyword: '',
      customer: '',
      category_id: '',
      status: '',
      priority: '',
      reminder: ''
    },
    viewMode: 'card' // card | kanban
  }),

  actions: {
    setFilter(key, val) {
      this.filters[key] = val
      if (key !== 'page') this.filters.page = 1
    },
    resetFilters() {
      this.filters = { page: 1, pageSize: 50, keyword: '', customer: '', category_id: '', status: '', priority: '', reminder: '' }
    },
    async loadList() {
      this.loading = true
      try {
        const params = {}
        for (const [k, v] of Object.entries(this.filters)) {
          if (v !== '' && v !== null && v !== undefined) params[k] = v
        }
        const r = await fetchNotes(params)
        this.list = r.data.list || []
        this.total = r.data.total || 0
      } catch (e) {
        console.error('加载记事列表失败', e)
        this.list = []; this.total = 0
      } finally {
        this.loading = false
      }
    },
    async loadDetail(id) {
      try {
        const r = await getNote(id)
        this.current = r.data
      } catch {
        this.current = null
      }
    },
    async add(data) {
      const r = await createNote(data)
      return r.data
    },
    async edit(id, data) {
      await updateNote(id, data)
    },
    async remove(id) {
      await deleteNote(id)
    },
    async loadCategories() {
      try {
        const r = await fetchCategories()
        this.categories = r.data || []
      } catch {
        this.categories = []
      }
    }
  }
})
