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
              <h2 class="note-title">{{ note.title }}</h2>
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
                {{ {todo:'待办',in_progress:'进行中',done:'已完成'}[note.status] || '待办' }}
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

            <div class="img-gallery" v-if="images.length">
              <div v-for="(img, i) in images" :key="i" class="gallery-item" @click="previewIdx = i; showPreview = true">
                <img :src="img" loading="lazy" />
                <div class="gallery-overlay">{{ i + 1 }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 自定义图片浏览器（带左右箭头） -->
        <van-overlay :show="showPreview" z-index="2000">
          <div class="viewer-wrap" @click="showPreview = false">
            <div class="viewer-top">
              <span class="viewer-count">{{ previewIdx + 1 }} / {{ images.length }}</span>
              <div class="viewer-top-right">
                <button class="viewer-copy" @click.stop="copyCurrentImage">复制图片</button>
                <button class="viewer-close" @click="showPreview = false">✕</button>
              </div>
            </div>
            <img :src="images[previewIdx]" class="viewer-img" @click.stop />
            <button v-if="previewIdx > 0" class="viewer-nav viewer-prev" @click.stop="previewIdx--">‹</button>
            <button v-if="previewIdx < images.length - 1" class="viewer-nav viewer-next" @click.stop="previewIdx++">›</button>
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

const images = computed(() => {
  try { return note.value?.images ? JSON.parse(note.value.images) : [] } catch { return [] }
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
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
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
  } catch {}
}

function goBack() { router.push('/notes') }
async function copyCurrentImage() {
  const url = images.value[previewIdx.value]
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
.back-btn { background: none; border: none; color: #1989fa; font-size: 15px; cursor: pointer; padding: 4px 8px; font-family: inherit; }
.header-actions { display: flex; gap: 8px; }
.edit-btn { padding: 4px 12px; border-radius: 4px; border: 1px solid #1989fa; color: #1989fa; font-size: 12px; cursor: pointer; background: #fff; text-decoration: none; transition: all .15s; }
.edit-btn:hover { background: #e6f4ff; }
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
.status-badge.todo { background: #f5f5f5; color: #757575; }
.status-badge.in_progress { background: #e3f2fd; color: #1565c0; }
.status-badge.done { background: #e8f5e9; color: #2e7d32; }
.date-item { color: #999; }
.reminder-info { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #666; margin-bottom: 12px; padding: 8px 12px; background: #fff8e1; border-radius: 6px; }
.reminder-icon { font-size: 14px; }
.reminder-pending { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: #ff6b35; color: #fff; }
.reminder-done { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: #e8f5e9; color: #2e7d32; }
.divider { height: 1px; background: #f0f0f0; margin: 12px 0; }
.note-content { font-size: 14px; line-height: 1.8; color: #323233; word-break: break-word; }
.note-content :deep(code) { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.note-content :deep(h1), .note-content :deep(h2), .note-content :deep(h3), .note-content :deep(h4) { margin: 12px 0 6px; }
.note-content :deep(a) { color: #1989fa; }
.img-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
.gallery-item { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid #f0f0f0; cursor: pointer; aspect-ratio: 1; }
.gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .3s; }
.gallery-item:hover img { transform: scale(1.08); }
.gallery-overlay { position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,.5); color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 8px; }

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
</style>
