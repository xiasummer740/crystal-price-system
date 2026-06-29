import { defineStore } from 'pinia'

export const useSaveStatusStore = defineStore('saveStatus', {
  state: () => ({
    status: 'idle',         // 'idle' | 'saving' | 'saved' | 'failed'
    lastSavedAt: null,      // Date 对象，最近一次保存成功的时间
    lastError: null,        // 字符串，最近一次保存失败的错误信息
    inflight: 0              // 进行中的写请求计数（>0 时显示 saving）
  }),
  getters: {
    isSaving: (state) => state.status === 'saving',
    isSaved: (state) => state.status === 'saved',
    isFailed: (state) => state.status === 'failed',
    // 已保存的时间字符串 HH:mm:ss
    savedAtText: (state) => {
      if (!state.lastSavedAt) return ''
      const d = state.lastSavedAt
      const pad = (n) => String(n).padStart(2, '0')
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    }
  },
  actions: {
    setSaving() {
      this.inflight++
      this.status = 'saving'
      this.lastError = null
    },
    setSaved() {
      if (this.inflight > 0) this.inflight--
      // 只有所有请求结束、且无失败标记时才切到 saved（不覆盖 failed）
      if (this.inflight === 0 && this.status !== 'failed') {
        this.status = 'saved'
        this.lastSavedAt = new Date()
        // 3 秒后自动回到 idle，避免显示过时的时间
        clearTimeout(this._autoReset)
        this._autoReset = setTimeout(() => {
          if (this.inflight === 0 && this.status === 'saved') this.status = 'idle'
        }, 3000)
      }
    },
    setFailed(err) {
      if (this.inflight > 0) this.inflight--
      this.status = 'failed'
      this.lastError = err?.message || String(err) || '未知错误'
    },
    reset() {
      clearTimeout(this._autoReset)
      this.status = 'idle'
      this.lastSavedAt = null
      this.lastError = null
      this.inflight = 0
    }
  }
})
