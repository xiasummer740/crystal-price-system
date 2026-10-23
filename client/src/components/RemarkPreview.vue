<template>
  <teleport to="body">
    <div v-if="show && items.length" class="rp-mask" @click.self="close">
      <div class="rp-panel" @click.stop>
        <div class="rp-head">
          <span class="rp-count">{{ index + 1 }} / {{ items.length }}</span>
          <span class="rp-name" :title="name(cur)">{{ name(cur) }}</span>
          <button class="rp-x" @click="close" title="关闭（Esc）">✕</button>
        </div>

        <div class="rp-body" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
          <button v-if="items.length > 1" class="rp-nav left" @click="prev" title="上一张（←）">‹</button>

          <img v-if="isImg(cur)" :src="cur" class="rp-img" alt="" @contextmenu="$emit('ctx', $event)" />
          <div v-else class="rp-file">
            <div class="rp-file-icon">{{ fileIcon(cur) }}</div>
            <div class="rp-file-name" :title="name(cur)">{{ name(cur) }}</div>
            <div class="rp-file-btns">
              <button @click="$emit('open', cur)">打开</button>
              <button class="primary" @click="$emit('copy', cur)">📋 复制文件</button>
            </div>
            <div class="rp-file-tip">复制后在微信聊天框 Ctrl+V，直接发文件</div>
          </div>

          <button v-if="items.length > 1" class="rp-nav right" @click="next" title="下一张（→）">›</button>
        </div>

        <div v-if="items.length > 1" class="rp-thumbs">
          <button v-for="(u, i) in items" :key="i" class="rp-thumb" :class="{ on: i === index }" @click="go(i)">
            <img v-if="isImg(u)" :src="u" alt="" />
            <span v-else class="rp-thumb-file">{{ ext(u) }}</span>
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
  index: { type: Number, default: 0 },
})
const emit = defineEmits(['update:show', 'update:index', 'open', 'copy', 'ctx'])

const cur = computed(() => props.items[props.index] || '')
const IMG = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|#|$)/i
function isImg(url) { return IMG.test(String(url || '')) }
function ext(url) {
  const m = String(url || '').match(/\.([a-z0-9]{1,5})(\?|#|$)/i)
  return m ? m[1].toUpperCase() : '文件'
}
function fileIcon(url) {
  const e = ext(url).toLowerCase()
  if (e === 'pdf') return '📄'
  if (['doc', 'docx'].includes(e)) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(e)) return '📊'
  if (['zip', 'rar', '7z'].includes(e)) return '🗜'
  return '📎'
}
function name(url) {
  const s = String(url || '').split('?')[0]
  try { return decodeURIComponent(s.split('/').pop() || s) } catch { return s.split('/').pop() || s }
}

function close() { emit('update:show', false) }
function go(i) {
  if (!props.items.length) return
  const n = props.items.length
  emit('update:index', ((i % n) + n) % n)
}
function prev() { go(props.index - 1) }
function next() { go(props.index + 1) }

// 键盘：← → 切换，Esc 关闭
function onKey(e) {
  if (!props.show) return
  if (e.key === 'Escape') { e.stopPropagation(); close() }
  else if (e.key === 'ArrowLeft' && props.items.length > 1) { e.preventDefault(); prev() }
  else if (e.key === 'ArrowRight' && props.items.length > 1) { e.preventDefault(); next() }
}

// 手机左右滑
let tx = 0, ty = 0
function onTouchStart(e) {
  const t = e.changedTouches?.[0]
  if (!t) return
  tx = t.clientX; ty = t.clientY
}
function onTouchEnd(e) {
  if (props.items.length < 2) return
  const t = e.changedTouches?.[0]
  if (!t) return
  const dx = t.clientX - tx, dy = t.clientY - ty
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { dx > 0 ? prev() : next() }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => props.show, v => { document.body.style.overflow = v ? 'hidden' : '' })
</script>

<style scoped>
.rp-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .78); z-index: 4000; display: flex; align-items: center; justify-content: center; }
.rp-panel { width: min(1100px, 94vw); height: min(86vh, 900px); display: flex; flex-direction: column; }
.rp-head { display: flex; align-items: center; gap: 12px; color: #e5e7eb; padding: 0 4px 10px; font-size: 13px; }
.rp-count { background: rgba(255, 255, 255, .14); border-radius: 12px; padding: 2px 10px; font-weight: 600; }
.rp-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cbd5e1; }
.rp-x { border: none; background: rgba(255, 255, 255, .14); color: #fff; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 14px; }
.rp-x:hover { background: rgba(255, 255, 255, .26); }
.rp-body { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.rp-img { max-width: 100%; max-height: 100%; object-fit: contain; background: #111; border-radius: 6px; box-shadow: 0 10px 40px rgba(0, 0, 0, .5); }
.rp-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 76px; border: none; border-radius: 8px; background: rgba(255, 255, 255, .16); color: #fff; font-size: 34px; line-height: 1; cursor: pointer; z-index: 2; }
.rp-nav:hover { background: rgba(255, 255, 255, .3); }
.rp-nav.left { left: 6px; }
.rp-nav.right { right: 6px; }
.rp-file { background: #fff; border-radius: 10px; padding: 36px 46px; text-align: center; min-width: 320px; }
.rp-file-icon { font-size: 54px; }
.rp-file-name { margin-top: 8px; font-size: 14px; color: #334155; word-break: break-all; max-width: 420px; }
.rp-file-btns { margin-top: 16px; display: flex; gap: 10px; justify-content: center; }
.rp-file-btns button { border: 1px solid #d5dbe3; background: #fff; border-radius: 6px; padding: 7px 16px; font-size: 13px; cursor: pointer; color: #334155; }
.rp-file-btns button.primary { background: #1989fa; border-color: #1989fa; color: #fff; }
.rp-file-tip { margin-top: 12px; font-size: 11px; color: #94a3b8; }
.rp-thumbs { display: flex; gap: 8px; justify-content: center; padding: 12px 0 2px; overflow-x: auto; }
.rp-thumb { width: 58px; height: 58px; border-radius: 6px; border: 2px solid transparent; background: rgba(255, 255, 255, .1); overflow: hidden; cursor: pointer; padding: 0; flex: 0 0 auto; }
.rp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rp-thumb.on { border-color: #1989fa; }
.rp-thumb-file { color: #e2e8f0; font-size: 11px; }
</style>
