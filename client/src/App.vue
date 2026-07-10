<template>
  <div id="app-root">
    <router-view v-slot="{ Component }">
      <keep-alive :include="['MapAddresses']">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { getAmapKey } from './utils/api.js'
import { loadAmapScript } from './utils/amap-map.js'

// 预加载高德地图 JS API — 应用启动时就开始下载脚本
// 等用户打开地图页时脚本已经缓存在浏览器中，省去 1-3 秒等待
onMounted(() => {
  const key = getAmapKey()
  if (key) {
    loadAmapScript(key).catch(() => {})
  }
})
</script>

<style>
</style>
