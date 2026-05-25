<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'

onMounted(async () => {
  // 注销旧版 Service Worker（PWA 已禁用）
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations()
    for (const r of regs) { try { await r.unregister() } catch {} }
  }
})
</script>
