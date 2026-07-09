<template>
  <transition name="page-fade">
    <div class="page-wrap">
      <!-- 加载中 -->
      <template v-if="!note">
        <header class="page-header">
          <button class="back-btn" @click="goBack">‹ 返回</button>
          <h3>记事详情</h3>
          <div style="width:60px"></div>
        </header>
        <div class="skeleton-body">
          <div class="skeleton-card-lg">
            <div class="sk-line w-80"></div>
            <div class="sk-line w-50"></div>
            <div class="sk-line w-100"></div>
            <div class="sk-line w-90"></div>
            <div class="sk-line w-70"></div>
            <div class="sk-line w-60"></div>
          </div>
        </div>
      </template>

      <!-- 内容 -->
      <template v-else>
        <header class="page-header">
          <button class="back-btn" @click="goBack">‹ 返回</button>
          <h3>记事详情</h3>
          <div class="header-actions">
            <router-link :to="'/notes/edit/' + note.id" class="edit-btn">编辑</router-link>
            <button class="del-btn" @click="handleDelete">删除</button>
          </div>
        </header>

        <div class="page-body">
          <div class="detail-card">
            <div class="detail-header">
              <h2 class="note-title" v-if="note.title">{{ note.title }}</h2>
              <span v-if="note.is_pinned" class="pinned-badge">📌 置顶</span>
            </div>

            <div class="meta-row">
              <span class="meta-item" v-if="note.customer">👤 {{ note.customer }}</span>
              <span class="meta-item cat-badge" :style="{ background: note.category_color + '20', color: note.category_color }" v-if="note.category_name">
                {{ note.category_name }}
              </span>
              <span class="meta-item priority-badge" :class="'p' + (note.priority || 2)">
                {{ {1:'🔴 高',2:'🟡 中',3:'🔵 低'}[note.priority || 2] }}
              </span>
              <span class="meta-item status-badge" :class="note.status">
                {{ {todo:'待办',in_progress:'进行中',done:'已完成',follow_up:'跟进后续'}[note.status] || '待办' }}
              </span>
              <span class="meta-item date-item">📅 {{ (note.updated_at || note.created_at || '').slice(0, 10) }}</span>
            </div>

            <div class="reminder-info" v-if="note.reminder_at">
              <span class="reminder-icon">⏰</span>
              <span>提醒：{{ note.reminder_at.slice(0, 16) }}</span>
              <span v-if="!note.is_reminded" class="reminder-pending">待提醒</span>
              <span v-else class="reminder-done">已提醒</span>
            </div>

            <div class="divider"></div>

            <div class="note-content" v-html="renderedContent"></div>

            <!-- 图片附件 -->
            <div class="img-gallery" v-if="imageList.length">
              <div v-for="(img, i) in imageList" :key="i" class="gallery-item" @click="previewIdx = i; showPreview = true">
                <img :src="img" loading="lazy" />
                <div class="gallery-overlay">{{ i + 1 }}</div>
              </div>
            </div>
            <!-- 文件附件 -->
            <div class="file-list" v-if="fileList.length">
              <div v-for="(url, i) in fileList" :key="i" class="file-item" @click="downloadFile(url)" :title="'下载 ' + fileName(url)">
                <span class="file-item-icon">{{ fileIcon(url) }}</span>
                <span class="file-item-name">{{ fileName(url) }}</span>
                <span class="file-item-dl">⬇</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 自定义图片浏览器（带左右箭头） -->
        <van-overlay :show="showPreview" z-index="2000">
          <div class="viewer-wrap" @click="showPreview = false">
            <div class="viewer-top">
              <span class="viewer-count">{{ previewIdx + 1 }} / {{ imageList.length }}</span>
              <div class="viewer-top-right">
                <button class="viewer-copy" @click.stop="copyCurrentImage">复制图片</button>
                <button class="viewer-close" @click="showPreview = false">✕</button>
              </div>
            </div>
            <img :src="imageList[previewIdx]" class="viewer-img" @click.stop />
            <button v-if="previewIdx > 0" class="viewer-nav viewer-prev" @click.stop="previewIdx--">‹</button>
            <button v-if="previewIdx < imageList.length - 1" class="viewer-nav viewer-next" @click.stop="previewIdx++">›</button>
          </div>
        </van-overlay>
      </template>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { getNote, deleteNote } from '../utils/api.js'

const route = useRoute()
const router = useRouter()
const note = ref(null)
const showPreview = ref(false)
const previewIdx = ref(0)

// 判断 URL 是否为图片
function isImageUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url)
}
function fileIcon(url) {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return '📄'
  if (['doc','docx'].includes(ext)) return '📝'
  if (['xls','xlsx','csv'].includes(ext)) return '📊'
  if (['zip','rar','7z'].includes(ext)) return '📦'
  if (['txt','json','xml','md'].includes(ext)) return '📃'
  return '📎'
}
function fileName(url) {
  return decodeURIComponent(url.split('/').pop() || '')
    .replace(/^\d{13}-[a-z0-9]{6}-/, '')
}
const imageList = computed(() => {
  try { return (JSON.parse(note.value?.images || '[]')).filter(isImageUrl) } catch { return [] }
})
const fileList = computed(() => {
  try { return (JSON.parse(note.value?.images || '[]')).filter(u => !isImageUrl(u)) } catch { return [] }
})

const renderedContent = computed(() => {
  if (!note.value?.content) return '<p style="color:#bbb;padding:8px 0">暂无内容</p>'
  let html = note.value.content
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/#### (.+)/g, '<h4>$1</h4>')
    .replace(/### (.+)/g, '<h3>$1</h3>')
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/# (.+)/g, '<h1>$1</h1>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
      const safe = url.replace(/^javascript:/i, '').replace(/^data:/i, '')
      return `<a href="${safe}" target="_blank" rel="noopener">${text}</a>`
    })
    .replace(/\n/g, '<br/>')
  return html
})

onMounted(async () => {
  try {
    const r = await getNote(route.params.id)
    note.value = r.data
  } catch (e) {
    showToast('加载失败')
    router.push('/notes')
  }
})

async function handleDelete() {
  try {
    await showConfirmDialog({ title: '确认删除', message: `删除「${note.value.title}」？` })
    await deleteNote(note.value.id)
    showToast('已删除')
    router.push('/notes')
  } catch (e) {
    if (e !== 'cancel' && !e?.message?.includes('cancel')) showToast('删除失败: ' + (e.response?.data?.msg || e.message))
  }
}

function goBack() {
  if (route.query.from === 'reports') {
    router.push('/reports')
  } else {
    router.push('/notes')
  }
}
// 下载文件，使用原始文件名（去掉时间戳前缀）
async function downloadFile(url) {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName(url)
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    // 兜底：直接用原链接打开
    window.open(url, '_blank')
  }
}
async function copyCurrentImage() {
  const url = imageList.value[previewIdx.value]
  if (!url) return
  try {
    const fullUrl = url.startsWith('http') ? url : window.location.origin + url
    const resp = await fetch(fullUrl)
    const blob = await resp.blob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    showToast('图片已复制，可直接粘贴到微信')
  } catch (e) {
    // 兜底：复制地址
    try {
      const fullUrl = url.startsWith('http') ? url : window.location.origin + url
      await navigator.clipboard.writeText(fullUrl)
      showToast('图片地址已复制')
    } catch { showToast('复制失败') }
  }
}
</script>

<style scoped>
.page-fade-enter-active { transition: opacity .2s ease, transform .2s ease; }
.page-fade-enter-from { opacity: 0; transform: translateY(8px); }
.page-wrap { display: flex; flex-direction: column; height: 100vh; background: #f5f6f8; }
.page-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e8e8e8; flex-shrink: 0; }
.page-header h3 { font-size: 16px; font-weight: 600; color: #323233; margin: 0; }
.back-btn { background: none; border: none; color: var(--color-primary); font-size: 15px; cursor: pointer; padding: 4px 8px; font-family: inherit; }
.header-actions { display: flex; gap: 8px; }
.edit-btn { padding: 4px 12px; border-radius: 4px; border: 1px solid var(--color-primary); color: var(--color-primary); font-size: 12px; cursor: pointer; background: #fff; text-decoration: none; transition: all .15s; }
.edit-btn:hover { background: rgba(var(--color-primary-rgb),.08); }
.del-btn { padding: 4px 12px; border-radius: 4px; border: 1px solid #ee0a24; color: #ee0a24; font-size: 12px; cursor: pointer; background: #fff; font-family: inherit; transition: all .15s; }
.del-btn:hover { background: #fff0f0; }

/* 骨架屏 */
.skeleton-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
.skeleton-card-lg { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
.sk-line { height: 14px; background: #eee; border-radius: 4px; margin-bottom: 12px; animation: sk-pulse 1.5s infinite ease-in-out; }
.sk-line.w-80 { width: 80%; height: 20px; }
.sk-line.w-50 { width: 50%; }
.sk-line.w-100 { width: 100%; }
.sk-line.w-90 { width: 90%; }
.sk-line.w-70 { width: 70%; }
.sk-line.w-60 { width: 60%; }
@keyframes sk-pulse { 0%,100% { opacity: .4; } 50% { opacity: .8; } }

.page-body { flex: 1; overflow-y: auto; padding: 12px 16px; }
.detail-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.04); animation: card-in .3s ease; }
@keyframes card-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.detail-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.note-title { font-size: 20px; font-weight: 600; color: #1a1a2e; margin: 0; flex: 1; word-break: break-word; }
.pinned-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #fff3e0; color: #e65100; white-space: nowrap; }
.meta-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.meta-item { font-size: 12px; padding: 3px 8px; border-radius: 4px; background: #f5f6f8; color: #666; }
.cat-badge { font-weight: 500; }
.priority-badge.p1 { background: #fff0f0; color: #c62828; }
.priority-badge.p2 { background: #fff8e1; color: #f57f17; }
.priority-badge.p3 { background: #e8f4fd; color: #1565c0; }
.status-badge.todo { background: #fff7e6; color: #d46b08; border: 1px solid #ffd591; box-shadow: 0 0 8px rgba(212,107,8,.25); animation: glow-orange 2s ease-in-out infinite; }
.status-badge.in_progress { background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; box-shadow: 0 0 8px rgba(24,144,255,.25); animation: glow-blue 2s ease-in-out infinite; }
.status-badge.done { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; box-shadow: 0 0 8px rgba(56,158,13,.25); animation: glow-green 2s ease-in-out infinite; }
.status-badge.follow_up { background: #fff3e0; color: #e65100; border: 1px solid #ffcc80; box-shadow: 0 0 8px rgba(230,81,0,.25); animation: glow-orange 2s ease-in-out infinite; }
@keyframes glow-orange { 0%,100% { box-shadow: 0 0 6px rgba(212,107,8,.25); } 50% { box-shadow: 0 0 14px rgba(212,107,8,.45); } }
@keyframes glow-blue { 0%,100% { box-shadow: 0 0 6px rgba(24,144,255,.25); } 50% { box-shadow: 0 0 14px rgba(24,144,255,.45); } }
@keyframes glow-green { 0%,100% { box-shadow: 0 0 6px rgba(56,158,13,.25); } 50% { box-shadow: 0 0 14px rgba(56,158,13,.45); } }
.date-item { color: #999; }
.reminder-info { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #666; margin-bottom: 12px; padding: 8px 12px; background: #fff8e1; border-radius: 6px; }
.reminder-icon { font-size: 14px; }
.reminder-pending { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: #ff6b35; color: #fff; }
.reminder-done { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: #e8f5e9; color: #2e7d32; }
.divider { height: 1px; background: #f0f0f0; margin: 12px 0; }
.note-content { font-size: 14px; line-height: 1.8; color: #323233; word-break: break-word; }
.note-content :deep(code) { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.note-content :deep(h1), .note-content :deep(h2), .note-content :deep(h3), .note-content :deep(h4) { margin: 12px 0 6px; }
.note-content :deep(a) { color: var(--color-primary); }
.img-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
.gallery-item { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid #f0f0f0; cursor: pointer; aspect-ratio: 1; }
.gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .3s; }
.gallery-item:hover img { transform: scale(1.08); }
.gallery-overlay { position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,.5); color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 8px; }

/* 文件列表 */
.file-list { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.file-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #f7f8fa; border-radius: 8px; cursor: pointer; transition: background .15s; }
.file-item:hover { background: #eef0f4; }
.file-item:active { transform: scale(.99); }
.file-item-icon { font-size: 22px; line-height: 1; pointer-events:none }
.file-item-name { flex: 1; font-size: 12px; color: #323233; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; pointer-events:none }
.file-item-dl { font-size: 14px; color: var(--color-primary); flex-shrink: 0; pointer-events:none }

/* 自定义图片浏览器 */
.viewer-wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #000; z-index: 2001; }
.viewer-top { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; z-index: 2002; }
.viewer-count { color: #fff; font-size: 14px; background: rgba(0,0,0,.4); padding: 4px 12px; border-radius: 12px; }
.viewer-top-right { display: flex; align-items: center; gap: 8px; }
.viewer-copy { padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.1); color: #fff; font-size: 12px; cursor: pointer; font-family: inherit; transition: all .15s; }
.viewer-copy:hover { background: rgba(255,255,255,.25); border-color: rgba(255,255,255,.5); }
.viewer-close { width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(255,255,255,.15); color: #fff; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s; }
.viewer-close:hover { background: rgba(255,255,255,.3); }
.viewer-img { max-width: 95vw; max-height: 90vh; object-fit: contain; }
.viewer-nav { position: fixed; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 50%; border: none; background: rgba(255,255,255,.12); color: #fff; font-size: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; z-index: 2002; line-height: 1; }
.viewer-nav:hover { background: rgba(255,255,255,.3); transform: translateY(-50%) scale(1.1); }
.viewer-nav:active { transform: translateY(-50%) scale(.95); }
.viewer-prev { left: 20px; }
.viewer-next { right: 20px; }

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .viewer-nav{width:40px;height:40px;font-size:24px}
  .viewer-prev{left:8px}
  .viewer-next{right:8px}
}
</style>
