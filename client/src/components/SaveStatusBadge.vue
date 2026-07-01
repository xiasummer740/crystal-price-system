<template>
  <span class="save-badge" :class="badgeClass" :title="tipText" @click="onClick">
    <span class="dot" :class="dotClass"></span>
    <span class="text">{{ labelText }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { useSaveStatusStore } from '../stores/saveStatus.js'

const store = useSaveStatusStore()

const badgeClass = computed(() => ({
  'is-saving': store.isSaving,
  'is-saved': store.isSaved,
  'is-failed': store.isFailed,
  'is-idle': store.status === 'idle'
}))

const dotClass = computed(() => ({
  'dot-spin': store.isSaving
}))

const labelText = computed(() => {
  if (store.isSaving) return '保存中…'
  if (store.isFailed) return '保存失败 ⚠'
  if (store.isSaved) return `已保存 ${store.savedAtText}`
  // idle 但有上次保存时间 — 继续显示
  if (store.lastSavedAt) return store.savedAtText
  return ''
})

const tipText = computed(() => {
  if (store.isFailed) return store.lastError || '保存失败'
  if (store.lastSavedAt) return store.lastSavedAt.toLocaleString()
  return ''
})

function onClick() {
  if (!store.isFailed) return
  store.reset()
}
</script>

<style scoped>
.save-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  margin-left: 6px;
  font-size: 12px;
  border-radius: 14px;
  background: #f7f8fa;
  color: #666;
  border: 1px solid #e8e8e8;
  user-select: none;
  white-space: nowrap;
  transition: background .2s, color .2s, border-color .2s;
}
.save-badge.is-saved {
  background: #f6ffed;
  color: #389e0d;
  border-color: #b7eb8f;
}
.save-badge.is-saving {
  background: #fffbe6;
  color: #d48806;
  border-color: #ffe58f;
}
.save-badge.is-failed {
  background: #fff1f0;
  color: #cf1322;
  border-color: #ffa39e;
  cursor: pointer;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
}
.dot-spin {
  animation: dot-pulse 1s ease-in-out infinite;
}
@keyframes dot-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: .5; }
}
</style>