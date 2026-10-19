/**
 * SuggestField（输入联想组件）单元测试
 *
 * 覆盖行为层面的关键约定：
 *   - 聚焦即出候选（历史值按原顺序 = 次数多的在前）
 *   - 敲字过滤 + 完全匹配排最前
 *   - ↑↓ 移动、Enter 选中并回填、Esc 关闭
 *   - 仍可手打新值（候选只是加速，不强制选择）
 *   - 候选里的用户数据必须转义（不被当成 HTML 执行）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref, nextTick } from 'vue'
import SuggestField from '../components/SuggestField.vue'

const options = ['SJK', 'TXC', '微盟', 'AVX']

function mountField(initial = '', opts = options) {
  const Parent = defineComponent({
    components: { SuggestField },
    template: `<SuggestField v-model="val" :options="opts" plain input-class="f-input" />`,
    setup() {
      const val = ref(initial)
      return { val, opts }
    }
  })
  const wrapper = mount(Parent, { attachTo: document.body })
  const input = wrapper.get('input')
  return { wrapper, input, value: () => wrapper.vm.val }
}

/** 下拉是 teleport 到 body 的，必须从 document 上查 */
function dropItems() {
  return [...document.querySelectorAll('.sf-drop .sf-item')].map(el => el.querySelector('.sf-text').textContent.trim())
}

let mounted = []
function mountTracked(...args) {
  const m = mountField(...args)
  mounted.push(m.wrapper)
  return m
}

describe('SuggestField', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => {
    for (const w of mounted) { try { w.unmount() } catch {} }
    mounted = []
    document.body.innerHTML = ''
  })

  it('聚焦即出全部候选（保持后端给的次数顺序）', async () => {
    const { input } = mountTracked()
    await input.trigger('focus')
    expect(dropItems()).toEqual(options)
  })

  it('敲字过滤：大小写不敏感，只留匹配项', async () => {
    const { input } = mountTracked()
    await input.trigger('focus')
    await input.setValue('t')
    await nextTick()
    expect(dropItems()).toEqual(['TXC'])
  })

  it('完全匹配排在同为「包含」的候选前面', async () => {
    const { input } = mountTracked('', ['XX-SJK-1', 'SJK', 'SJK2'])
    await input.trigger('focus')
    await input.setValue('SJK')
    await nextTick()
    expect(dropItems()[0]).toBe('SJK')
  })

  it('↓ + Enter 选中并回填 v-model，下拉收起', async () => {
    const { input, value } = mountTracked()
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(value()).toBe('SJK')
    expect(document.querySelector('.sf-drop')).toBeNull()
  })

  it('↓ ↓ + Enter 选第二项', async () => {
    const { input, value } = mountTracked()
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(value()).toBe('TXC')
  })

  it('Esc 关闭下拉，不改当前值', async () => {
    const { input, value } = mountTracked()
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(document.querySelector('.sf-drop')).toBeNull()
    expect(value()).toBe('')
  })

  it('手打新值不被候选限制（候选为空也能输入）', async () => {
    const { input, value } = mountTracked('', [])
    await input.setValue('全新料号-001')
    await nextTick()
    expect(value()).toBe('全新料号-001')
    expect(document.querySelector('.sf-drop')).toBeNull()
  })

  it('候选里的尖括号被转义（不执行 HTML）', async () => {
    const { input } = mountTracked('', ['<img src=x onerror=alert(1)>'])
    await input.trigger('focus')
    expect(document.querySelector('.sf-drop img')).toBeNull()
    expect(document.querySelector('.sf-drop .sf-text').textContent).toContain('<img')
  })

  it('点击候选项即回填', async () => {
    const { input, value } = mountTracked()
    await input.trigger('focus')
    const items = document.querySelectorAll('.sf-drop .sf-item')
    items[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(value()).toBe('微盟')
  })
})
