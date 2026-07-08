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
</script>

<style>
</style>
