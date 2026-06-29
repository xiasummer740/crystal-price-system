<template>
  <div id="app-root">
    <router-view />
    <SaveStatusBadge class="global-save-badge" />
  </div>
</template>

<script setup>
import SaveStatusBadge from './components/SaveStatusBadge.vue'
</script>

<style>
.global-save-badge {
  position: fixed !important;
  bottom: 16px !important;
  right: 16px !important;
  z-index: 9999 !important;
  box-shadow: 0 2px 12px rgba(0,0,0,.12) !important;
  margin-left: 0 !important;
}
</style>
