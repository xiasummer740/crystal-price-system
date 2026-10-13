<template>
  <div v-if="show" class="img-ctx-mask" @click="close" @contextmenu.prevent="close">
    <div class="img-ctx-menu" :style="menuStyle" @click.stop ref="menuRef">
      <button class="img-ctx-item" :disabled="busy" @click="doCopy">
        <span class="img-ctx-ico">📋</span>复制图片
      </button>
      <div class="img-ctx-tip">复制后可粘贴到微信 / Word / 画图</div>
    </div>
  </div>
</template>

<script setup>
/**
 * 图片右键菜单：给图片预览补上「复制图片」。
 *
 * 背景：浏览器内核自带的右键菜单在图片上只有「图片另存为 / 在新标签页打开」，
 * 没有「复制图片」这一项 —— 而「复制后粘到微信发人」正是日常在用的动作。
 *
 * 用法（父组件）：
 *   <ImageContextMenu ref="ctxRef" />
 *   <van-image-preview @contextmenu="onCtx" ... />
 *   其中 onCtx(e) 里取 e.target 的 src，再 ctxRef.value.open(e, src)
 */
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import { showToast } from 'vant'
import { guessImageName, urlToPngDataUrl } from '../utils/imageCopy.js'

const show = ref(false)
const x = ref(0)
const y = ref(0)
const imgUrl = ref('')
const imgName = ref('')
const busy = ref(false)
const menuRef = ref(null)

const MENU_W = 218
const MENU_H = 84

const menuStyle = computed(() => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    left: Math.max(6, Math.min(x.value, vw - MENU_W - 6)) + 'px',
    top: Math.max(6, Math.min(y.value, vh - MENU_H - 6)) + 'px'
  }
})

function close() {
  show.value = false
  busy.value = false
}

/** 由父组件的 @contextmenu 调用：event 用于定位，url 是当前正在看的那张图 */
function open(event, url) {
  if (!url) return
  imgUrl.value = url
  imgName.value = guessImageName(url)
  x.value = event?.clientX ?? 0
  y.value = event?.clientY ?? 0
  show.value = true
  nextTick(() => menuRef.value?.querySelector('button')?.focus())
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

async function doCopy() {
  if (busy.value) return
  const bridge = window.electronAPI
  if (!bridge?.copyImage) {
    close()
    return showToast('复制图片需要在桌面软件里使用')
  }
  busy.value = true
  const loading = showToast({ type: 'loading', message: '正在读取图片…', duration: 0, forbidClick: true })
  try {
    const dataUrl = await urlToPngDataUrl(imgUrl.value)
    const r = await bridge.copyImage({ dataUrl, name: imgName.value })
    close()
    showToast(r?.ok ? '图片已复制，可以去粘贴了' : (r?.msg || '复制失败'))
  } catch (err) {
    close()
    showToast('复制失败：' + (err?.message || err))
  } finally {
    loading.close()
  }
}

defineExpose({ open, close })
</script>

<style scoped>
.img-ctx-mask {
  position: fixed;
  inset: 0;
  /* 必须盖在图片预览之上（Vant 预览是 2000+ 层级） */
  z-index: 4000;
}
.img-ctx-menu {
  position: fixed;
  min-width: 200px;
  padding: 6px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .28);
  user-select: none;
}
.img-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font-size: 14px;
  color: #323233;
  text-align: left;
  cursor: pointer;
}
.img-ctx-item:hover:not(:disabled) { background: #f2f3f5; }
.img-ctx-item:disabled { opacity: .5; cursor: default; }
.img-ctx-ico { font-size: 15px; }
.img-ctx-tip {
  margin: 4px 12px 4px;
  padding-top: 6px;
  border-top: 1px solid #f0f0f0;
  font-size: 11px;
  color: #969799;
}
</style>
