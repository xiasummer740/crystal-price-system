<template>
  <van-popup v-model:show="visible" round position="bottom" :style="{ height: '65%' }" closeable @closed="$emit('close')">
    <div class="cat-wrap">
      <h3 class="cat-title">事项类型管理</h3>
      <div class="cat-list">
        <div v-for="(cat, i) in list" :key="cat.id" class="cat-item">
          <div class="cat-color" :style="{ background: cat.color }"></div>
          <input v-model="cat.name" class="cat-input" placeholder="类型名称" @change="onEdit(cat)" />
          <div class="color-presets">
            <button v-for="c in presetColors" :key="c" class="cp-btn"
              :style="{ background: c, outline: cat.color === c ? '2px solid ' + c : 'none', outlineOffset: cat.color === c ? '2px' : '0' }"
              @click="cat.color = c; onEdit(cat)"></button>
          </div>
          <button class="cat-del" @click="onDelete(cat, i)">×</button>
        </div>
      </div>
      <button class="cat-add" @click="onAdd">＋ 添加类型</button>
      <p class="cat-hint">事项类型用于区分记事类别（报价、订单、交期等）</p>
    </div>
  </van-popup>
</template>

<script setup>
import { ref, watch } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import { fetchCategories, createCategory, updateCategory, deleteCategory } from '../utils/api.js'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['close', 'updated'])
const visible = ref(false)
const list = ref([])
const presetColors = ['#008771','#ee0a24','#07c160','#ff6b35','#7232dd','#e6a23c','#52c41a','#eb2f96','#13c2c2','#fa541c']

watch(() => props.show, async (v) => {
  visible.value = v
  if (v) await load()
})

async function load() {
  try {
    const r = await fetchCategories()
    list.value = (r.data || []).map(c => ({ ...c }))
  } catch { list.value = [] }
}

async function onAdd() {
  try {
    const r = await createCategory({ name: '新类型', color: '#008771', sort_order: list.value.length })
    list.value.push({ id: r.data.id, name: '新类型', color: '#008771', sort_order: list.value.length, is_deleted: 0 })
    showToast('已添加')
    emit('updated')
  } catch (e) { showToast('添加失败: ' + e.message) }
}

async function onEdit(cat) {
  if (!cat.name.trim()) return
  try {
    await updateCategory(cat.id, { name: cat.name.trim(), color: cat.color })
    emit('updated')
  } catch (e) { showToast('修改失败: ' + e.message) }
}

async function onDelete(cat, i) {
  try {
    await showConfirmDialog({ title: '确认删除', message: `删除「${cat.name}」？关联记事将变为"未分类"` })
    await deleteCategory(cat.id)
    list.value.splice(i, 1)
    showToast('已删除')
    emit('updated')
  } catch (e) {
    if (e !== 'cancel' && !e?.message?.includes('cancel')) showToast('删除失败: ' + (e.response?.data?.msg || e.message))
  }
}
</script>

<style scoped>
.cat-wrap { padding: 20px 20px 24px; display: flex; flex-direction: column; height: 100%; }
.cat-title { font-size: 18px; font-weight: 600; margin: 0 0 16px; color: #323233; }
.cat-list { flex: 1; overflow-y: auto; }
.cat-item { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 8px 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #f0f0f0; }
.cat-color { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(0,0,0,.1); }
.cat-input { flex: 1; border: none; background: transparent; font-size: 14px; color: #323233; outline: none; font-family: inherit; padding: 4px 0; min-width: 60px; }
.cat-input:focus { border-bottom: 1px solid var(--color-primary); }
.color-presets { display: flex; gap: 3px; flex-shrink: 0; }
.cp-btn { width: 16px; height: 16px; border-radius: 50%; border: 1px solid rgba(0,0,0,.1); cursor: pointer; padding: 0; transition: transform .15s; }
.cp-btn:hover { transform: scale(1.3); }
.cat-del { width: 24px; height: 24px; border-radius: 50%; border: none; background: #fff0f0; color: #e53935; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .15s; }
.cat-del:hover { background: #ffcdd2; }
.cat-add { display: block; width: 100%; padding: 10px; border-radius: 8px; border: 1px dashed #d9d9d9; background: transparent; color: var(--color-primary); font-size: 14px; cursor: pointer; font-family: inherit; margin: 8px 0; transition: all .15s; }
.cat-add:hover { border-color: var(--color-primary); background: rgba(var(--color-primary-rgb),.04); }
.cat-hint { font-size: 11px; color: #bbb; text-align: center; margin: 4px 0 0; }

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .cat-item{padding:10px 8px;font-size:12px}
  .cat-name{font-size:12px}
  .cat-count{font-size:10px}
  .cat-del{width:24px;height:24px;font-size:12px}
  .cat-add{font-size:13px;padding:8px}
  .cat-hint{font-size:10px}
}
</style>
