import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { showNotify as vantNotify } from 'vant'
import App from './App.vue'
import router from './router'
import 'vant/lib/index.css'
import './assets/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// ============================================================
// 全局错误边界
// ============================================================

/** 上报前端错误到服务端 */
function reportError(msg, stack, extra = {}) {
  try {
    fetch('/api/logs/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        stack: (stack || '').slice(0, 1000),
        url: location.href,
        userAgent: navigator.userAgent,
        ...extra
      })
    }).catch(() => {})
  } catch {}
}

/** 显示用户友好的错误提醒 */
function showError(msg) {
  try {
    vantNotify({ type: 'danger', message: msg, duration: 5000 })
  } catch {
    try { alert('⚠️ ' + msg) } catch {}
  }
}

// Vue 组件渲染/生命周期中的错误
app.config.errorHandler = (err, instance, info) => {
  const msg = err?.message || String(err)
  const cmpName = instance?.$options?.name || instance?.type?.name || instance?.type?.__name || ''
  console.error(`[Vue Error] ${cmpName}:`, err, info)
  reportError(msg, err?.stack, { component: cmpName, info: String(info || '') })
  showError(`页面异常: ${msg.slice(0, 80)}`)
}

// 未捕获的运行时 JS 错误
window.onerror = (message, source, lineno, colno, error) => {
  const msg = typeof message === 'string' ? message : (message?.message || '未知错误')
  console.error('[window.onerror]', msg, source, lineno, colno)
  reportError(msg, error?.stack || '', { source: `${source || ''}:${lineno || ''}:${colno || ''}` })
  showError(`发生错误: ${msg.slice(0, 80)}`)
  return true // 阻止默认处理
}

// 未捕获的 Promise 异常
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const msg = reason?.message || reason?.reason || String(reason)
  console.error('[unhandledrejection]', msg)
  reportError(msg, reason?.stack || (reason && String(reason)), { type: 'unhandledrejection' })
  showError(`操作异常: ${msg.slice(0, 80)}`)
})

// ============================================================

app.mount('#app')
