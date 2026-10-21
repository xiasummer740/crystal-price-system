<template>
  <div ref="wrapRef" class="sf" @keydown.capture="onKeydown">
    <!-- 两种外观：Vant 表单（带 label）/ 原生输入框（客户物料等自定义表单，label 在外部） -->
    <van-field
      v-if="!plain"
      :label="label"
      :placeholder="placeholder"
      :type="type"
      :readonly="readonly"
      :disabled="disabled"
      :model-value="displayValue"
      @update:model-value="onFieldInput"
      @focus="onFocus"
      @blur="onBlur"
      @click-input="onClickInput"
    />
    <input
      v-else
      :class="inputClass || 'sf-plain-input'"
      :value="displayValue"
      :placeholder="placeholder"
      :type="type"
      :disabled="disabled"
      autocomplete="off"
      spellcheck="false"
      @input="onNativeInput"
      @focus="onFocus"
      @blur="onBlur"
      @click="onClickInput"
    />

    <Teleport to="body">
      <div v-if="isOpen" ref="dropRef" class="sf-drop" :style="dropStyle" role="listbox" @mousedown.prevent>
        <div
          v-for="(opt, i) in shown"
          :key="opt.value + '#' + i"
          class="sf-item"
          :class="{ 'is-active': i === activeIdx }"
          role="option"
          :aria-selected="i === activeIdx"
          @mouseenter="activeIdx = i"
          @click="choose(opt)"
        >
          <span class="sf-text" v-html="renderLabel(opt)"></span>
          <span v-if="opt.meta" class="sf-meta">{{ opt.meta }}</span>
          <span v-if="opt.note" class="sf-note" :title="opt.noteTitle || opt.note">{{ opt.note }}</span>
        </div>
        <div v-if="!shown.length" class="sf-empty">没有匹配项，可直接输入</div>
        <template v-else>
          <div v-if="matchTotal > shown.length" class="sf-more">还有 {{ matchTotal - shown.length }} 个，继续输入可缩小范围</div>
          <div v-else class="sf-tip">↑↓ 选择 · Enter 确认 · Esc 关闭</div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * SuggestField —— 带联想下拉的输入框
 *
 * 用途：录入页里「以前录过、以后还会录」的字段，敲一个字就出候选，↑↓+Enter 选，
 * 鼠标/触屏点也可以；选完把值回给 v-model，同时 emit('select', option) 让父组件
 * 做「选料号自动带出名称/规格」这类联动。
 *
 * 几个刻意的取舍（改之前先读）：
 *   - 下拉用 <Teleport to="body"> + position:fixed：表单常在 van-popup / 可滚动容器里，
 *     留在原地会被 overflow 裁掉（客户物料页以前就吃过这个亏）。
 *   - **不限制必须从候选里选**：候选只是加速，用户照样可以手打新值（录新料号是第一需求）。
 *   - 候选由父组件一次传入、本地过滤（不是每敲一个字打一次接口），所以敲字零延迟、离线也不卡。
 *   - 受控但不在 props 变化时自动弹层：只有用户聚焦/敲字/点击才弹，否则「选完关闭」会被
 *     v-model 回写重新打开。
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  /** 候选：字符串数组，或 { value, label?, meta?, raw? }（label 缺省用 value；meta 是右侧灰色小字） */
  options: { type: Array, default: () => [] },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' },
  /** true = 原生 input（外观完全交给 inputClass），false = Vant Field */
  plain: { type: Boolean, default: false },
  inputClass: { type: String, default: '' },
  maxItems: { type: Number, default: 8 },
  /** 下拉最小/指定宽度：料号很长、输入框很窄时（客户物料弹窗），给下拉一个更宽的值 */
  dropWidth: { type: Number, default: 0 },
  readonly: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'select', 'focus', 'blur'])

const wrapRef = ref(null)
const dropRef = ref(null)
const focused = ref(false)
const isOpen = ref(false)
const activeIdx = ref(-1)
const dropStyle = ref({})

const displayValue = computed(() => (props.modelValue == null ? '' : String(props.modelValue)))
/** 用来过滤/高亮的关键字（去掉首尾空格，避免输入空格时列表全空） */
const query = computed(() => displayValue.value.trim())

/** 统一候选格式；顺带存小写，过滤时不用反复 toLowerCase */
const normalized = computed(() => (props.options || [])
  .map((o, i) => {
    if (o == null) return null
    if (typeof o === 'string' || typeof o === 'number') {
      const v = String(o)
      return { value: v, label: v, meta: '', note: '', noteTitle: '', raw: o, i }
    }
    const value = String(o.value ?? o.label ?? '')
    return {
      value,
      label: o.label != null ? String(o.label) : value,
      meta: o.meta != null ? String(o.meta) : '',
      // 第三段小字（v1.0.235）：目前用来显示「哪些客户也用过这颗料」，title 里放完整名单
      note: o.note != null ? String(o.note) : '',
      noteTitle: o.noteTitle != null ? String(o.noteTitle) : '',
      raw: o.raw != null ? o.raw : o,
      i
    }
  })
  .filter(o => o && o.value !== '')
  .map(o => ({ ...o, lv: o.value.toLowerCase(), ll: o.label.toLowerCase() })))

/** 排序：完全相同 > 开头相同 > 包含；同档保持后端给的顺序（次数多的在前） */
const matchResult = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return { list: normalized.value.slice(0, props.maxItems), total: normalized.value.length }
  const scored = []
  for (const o of normalized.value) {
    let rank
    if (o.lv === q || o.ll === q) rank = 0
    else if (o.lv.startsWith(q) || o.ll.startsWith(q)) rank = 1
    else if (o.lv.includes(q) || o.ll.includes(q)) rank = 2
    else continue
    scored.push({ o, rank })
  }
  scored.sort((a, b) => a.rank - b.rank || a.o.i - b.o.i)
  return { list: scored.slice(0, props.maxItems).map(s => s.o), total: scored.length }
})

const shown = computed(() => matchResult.value.list)
const matchTotal = computed(() => matchResult.value.total)

function canOpen() {
  return !props.disabled && !props.readonly && normalized.value.length > 0
}

function openDrop() {
  if (!canOpen()) return
  isOpen.value = true
  activeIdx.value = -1
  nextTick(updatePosition)
}

function closeDrop() {
  isOpen.value = false
  activeIdx.value = -1
}

function updatePosition() {
  const el = wrapRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  // 料号这类长文本：允许父组件指定一个比输入框更宽的下拉（不会超出视口）
  const width = Math.max(Math.min(props.dropWidth || r.width, vw - 16), 180)
  const left = Math.min(Math.max(r.left, 8), Math.max(vw - width - 8, 8))
  const spaceBelow = vh - r.bottom - 8
  const spaceAbove = r.top - 8
  // 下方放不下（贴屏幕底 / 在弹窗底部）就翻到上面，别让候选被窗口切掉
  const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow
  const maxHeight = Math.max(120, Math.min(300, placeAbove ? spaceAbove : spaceBelow))
  const style = {
    position: 'fixed',
    left: left + 'px',
    width: width + 'px',
    maxHeight: maxHeight + 'px',
    zIndex: 4000
  }
  if (placeAbove) style.bottom = (vh - r.top + 4) + 'px'
  else style.top = (r.bottom + 4) + 'px'
  dropStyle.value = style
}

function onFocus(e) {
  focused.value = true
  openDrop()
  emit('focus', e)
}

function onBlur(e) {
  focused.value = false
  // 给「点候选」留一点时间：mousedown.prevent 已挡住大部分失焦，这里兜底
  setTimeout(() => { if (!focused.value) isOpen.value = false }, 150)
  emit('blur', e)
}

function onClickInput() {
  if (!isOpen.value) openDrop()
}

function onFieldInput(v) {
  emit('update:modelValue', v)
  if (focused.value) openDrop()
}

function onNativeInput(e) {
  emit('update:modelValue', e.target.value)
  if (focused.value) openDrop()
}

function choose(opt) {
  emit('update:modelValue', opt.value)
  emit('select', opt)
  closeDrop()
}

function moveActive(step) {
  if (!shown.value.length) return
  const n = shown.value.length
  if (activeIdx.value < 0) activeIdx.value = step > 0 ? 0 : n - 1
  else activeIdx.value = (activeIdx.value + step + n) % n
  nextTick(() => {
    const el = dropRef.value?.querySelector('.sf-item.is-active')
    // jsdom / 老浏览器没有 scrollIntoView，别为了高亮把整个组件搞崩
    el?.scrollIntoView?.({ block: 'nearest' })
  })
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    if (!isOpen.value) {
      if (!canOpen()) return
      openDrop()
      moveActive(1)
    } else {
      moveActive(1)
    }
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (e.key === 'ArrowUp') {
    if (!isOpen.value) return
    moveActive(-1)
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (e.key === 'Escape') {
    if (!isOpen.value) return
    closeDrop()
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (e.key === 'Tab') {
    closeDrop()
    return
  }
  if (e.key === 'Enter') {
    if (!isOpen.value) return
    const hit = shown.value[activeIdx.value]
    if (hit) {
      choose(hit)
      e.preventDefault()
      e.stopPropagation()
    } else {
      closeDrop()
    }
  }
}

/** 命中的字高亮；候选是数据库里的用户数据，先转义再拼标签（防 XSS） */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}
function renderLabel(opt) {
  const label = String(opt.label ?? '')
  const q = query.value
  if (!q) return escapeHtml(label)
  const idx = label.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return escapeHtml(label)
  return escapeHtml(label.slice(0, idx)) +
    '<b class="sf-hit">' + escapeHtml(label.slice(idx, idx + q.length)) + '</b>' +
    escapeHtml(label.slice(idx + q.length))
}

// 输入内容变了（清空/粘贴/程序回填）时从第一项重新算，别停在旧的高亮位置
watch(query, () => { activeIdx.value = -1 })

function onWindowScroll() { if (isOpen.value) updatePosition() }
function onDocMouseDown(e) {
  if (!isOpen.value) return
  const t = e.target
  if (wrapRef.value?.contains(t) || dropRef.value?.contains(t)) return
  closeDrop()
}
onMounted(() => {
  window.addEventListener('scroll', onWindowScroll, true)
  window.addEventListener('resize', onWindowScroll)
  document.addEventListener('mousedown', onDocMouseDown, true)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onWindowScroll, true)
  window.removeEventListener('resize', onWindowScroll)
  document.removeEventListener('mousedown', onDocMouseDown, true)
})

defineExpose({
  focus: () => wrapRef.value?.querySelector('input')?.focus(),
  open: openDrop,
  close: closeDrop
})
</script>

<style scoped>
.sf { position: relative; display: block; width: 100%; }
/* 原生输入交给父级给 class（f-input 等），但宽度/盒模型必须撑满，否则在 grid 里只有默认宽度 */
.sf > input { width: 100%; box-sizing: border-box; }
.sf-plain-input { width: 100%; box-sizing: border-box; }

.sf-drop {
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .13);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 4px 0;
  overscroll-behavior: contain;
}
.sf-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1.35;
  color: #323233;
  cursor: pointer;
  user-select: none;
}
.sf-item:hover, .sf-item.is-active { background: #eef6ff; }
.sf-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sf-meta {
  flex-shrink: 0;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #969799;
}
/* 第三段：客户使用情况（v1.0.235），完整名单放 title */
.sf-note {
  flex-shrink: 0;
  max-width: 30%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #576b95;
  background: #f0f5ff;
  border-radius: 8px;
  padding: 1px 6px;
}
.sf-hit { color: var(--color-primary, #1989fa); font-weight: 600; }
.sf-empty, .sf-more, .sf-tip {
  padding: 6px 12px;
  font-size: 11px;
  color: #969799;
  border-top: 1px solid #f2f3f5;
  white-space: nowrap;
}
.sf-empty { border-top: none; }
.sf-tip { color: #c8c9cc; }

/* 触屏：候选大一点好点 */
@media (max-width: 768px) {
  .sf-item { min-height: 42px; font-size: 14px; padding: 8px 14px; }
  .sf-meta { font-size: 12px; }
  .sf-note { font-size: 12px; }
  .sf-empty, .sf-more { font-size: 12px; }
  .sf-tip { display: none; }
}
</style>
