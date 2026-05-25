<template>
  <div class="app-wrap">
    <header class="topbar">
      <div class="topbar-left"><span class="logo-dot"></span><span class="logo-text">晶振报价系统</span></div>
      <div class="topbar-right">
        <router-link to="/" class="nav-btn">← 返回主页</router-link>
      </div>
    </header>

    <div class="tl-main">
      <div v-if="!file" class="tl-upload-area">
        <div class="tl-upload-box" @click="triggerUpload" @dragover.prevent @drop.prevent="onDrop">
          <input ref="fileInputRef" type="file" accept=".pdf,.docx,.doc" hidden @change="onFileChange" />
          <span class="tl-upload-icon">📄</span>
          <span class="tl-upload-text">点击或拖拽上传外文规格书</span>
          <span class="tl-upload-sub">支持 PDF / Word，右侧同步显示中文翻译覆盖版</span>
        </div>
      </div>

      <div v-else class="tl-workspace">
        <div class="tl-toolbar">
          <span class="tl-file-info">📄 {{ file.name }}</span>
          <div class="tl-toolbar-actions">
            <button class="tl-btn primary" @click="translateAll" :disabled="translating">
              {{ translating ? `翻译中 ${translateProgress}%...` : '全部翻译' }}
            </button>
            <button class="tl-btn" @click="resetAll">更换文件</button>
          </div>
        </div>

        <div v-if="errorMsg" class="tl-error-bar">{{ errorMsg }}</div>

        <div class="tl-columns">
          <!-- 左：原版 -->
          <div class="tl-col tl-original-panel">
            <div class="tl-panel-title">📷 原版规格书</div>
            <div class="tl-scroll" ref="leftScroll" @scroll="onLeftScroll">
              <div v-if="!pdfReady" class="tl-loading-state"><van-loading size="20" /> 正在渲染...</div>
              <div v-for="p in totalPages" :key="'l'+p" class="tl-page-wrap">
                <div class="tl-page-label">第 {{ p }} 页</div>
                <canvas :ref="el => setCanvasRef(p, el)" class="tl-pdf-canvas"></canvas>
              </div>
            </div>
          </div>

          <!-- 右：中文翻译覆盖版 -->
          <div class="tl-col tl-translation-panel">
            <div class="tl-panel-title">📝 中文翻译版</div>
            <div class="tl-scroll" ref="rightScroll" @scroll="onRightScroll">
              <div v-if="!pdfReady" class="tl-loading-state"><van-loading size="20" /> 正在渲染...</div>
              <div v-if="pdfReady && !hasTranslation && !translating" class="tl-placeholder">
                点击「全部翻译」开始翻译，图片布局将保持不变
              </div>
              <div v-for="pg in pagesData" :key="'r'+pg.page" class="tl-page-wrap">
                <div class="tl-page-label">第 {{ pg.page }} 页</div>
                <div class="tl-canvas-wrap"
                     :style="{ width: Math.round(pg.width * SCALE) + 'px', height: Math.round(pg.height * SCALE) + 'px' }">
                  <canvas :ref="el => setRightCanvasRef(pg.page, el)" class="tl-pdf-canvas"></canvas>
                  <!-- 中文文字覆盖层 -->
                  <template v-if="translatedMap[pg.page]">
                    <div v-for="(line, li) in pg.lines"
                         v-show="translatedMap[pg.page][li]"
                         :key="li"
                         class="tl-overlay-item"
                         :style="overlayStyle(line)">
                      {{ translatedMap[pg.page][li] || '' }}
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { showToast } from 'vant'
import { http } from '../utils/api.js'

const SCALE = 1.2  // 与 renderPage 保持一致

const fileInputRef = ref(null)
const file = ref(null)
const pdfReady = ref(false)
const totalPages = ref(0)
const pagesData = ref([])          // [{ page, width, height, lines:[{text,x,y,h,w}] }]
const translatedMap = ref({})      // { pageNum: { lineIdx: translatedText } }
const translateProgress = ref(0)
const translating = ref(false)
const errorMsg = ref('')
const leftScroll = ref(null)
const rightScroll = ref(null)

let pdfDoc = null
let canvasRefs = {}
let rightCanvasRefs = {}
let syncScroll = false

const hasTranslation = computed(() => Object.keys(translatedMap.value).length > 0)

function setCanvasRef(page, el) { if (el) canvasRefs[page] = el }
function setRightCanvasRef(page, el) { if (el) rightCanvasRefs[page] = el }

function overlayStyle(line) {
  return {
    left: Math.round(line.x * SCALE) + 'px',
    top: Math.round(line.y * SCALE) + 'px',
    minWidth: Math.round(line.w * SCALE) + 'px',
    height: Math.round(line.h * SCALE * 1.3) + 'px',
    fontSize: Math.round(line.h * SCALE * 0.82) + 'px',
    lineHeight: Math.round(line.h * SCALE * 1.3) + 'px',
  }
}

function triggerUpload() { fileInputRef.value?.click() }
function onDrop(e) {
  const f = e.dataTransfer?.files?.[0]
  if (f) { file.value = f; loadFile(f) }
}
function onFileChange(e) {
  const f = e.target?.files?.[0]
  if (f) { file.value = f; loadFile(f) }
}

async function loadFile(f) {
  errorMsg.value = ''; translatedMap.value = {}; pagesData.value = []
  pdfReady.value = false; totalPages.value = 0; translateProgress.value = 0
  try {
    const fd = new FormData(); fd.append('file', f)
    const r = await http.post('/translator/upload', fd, { timeout: 30000 })
    if (r.code !== 0) { errorMsg.value = r.msg; return }
    pagesData.value = r.data.paragraphs
    totalPages.value = pagesData.value.length
    if (f.name.toLowerCase().endsWith('.pdf')) {
      await renderAllPages(f)
    } else {
      pdfReady.value = true
    }
  } catch (e) {
    errorMsg.value = '加载失败: ' + (e.response?.data?.msg || e.message || '网络错误')
  }
}

async function renderAllPages(f) {
  const buf = await f.arrayBuffer()
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const data = new Uint8Array(buf)
  pdfDoc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise
  totalPages.value = pdfDoc.numPages
  pdfReady.value = true
  await nextTick()
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    renderPage(i, false)
    renderPage(i, true)
  }
}

async function renderPage(num, isRight) {
  if (!pdfDoc) return
  await nextTick()
  const canvas = isRight ? rightCanvasRefs[num] : canvasRefs[num]
  if (!canvas) return
  try {
    const page = await pdfDoc.getPage(num)
    const viewport = page.getViewport({ scale: SCALE })
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  } catch {}
}

async function translateOne(src) {
  if (!src || !src.trim()) return src
  if (/^[\d\s.,;:+\-*/=<>%°ΩμΑ-Ωα-ω]+$/.test(src.trim())) return src
  const apis = [
    () => fetch('https://lingva.ml/api/v1/en/zh/' + encodeURIComponent(src.trim()), { signal: AbortSignal.timeout(8000) })
          .then(r => r.json()).then(d => d?.translation || null),
    () => fetch('https://lingva.tiekoetter.com/api/v1/en/zh/' + encodeURIComponent(src.trim()), { signal: AbortSignal.timeout(8000) })
          .then(r => r.json()).then(d => d?.translation || null),
    () => fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh&dt=t&q=' + encodeURIComponent(src.trim()), { signal: AbortSignal.timeout(8000) })
          .then(r => r.json()).then(d => d?.[0]?.map(x => x?.[0]).filter(Boolean).join('') || null),
  ]
  for (const api of apis) {
    try {
      const result = await api()
      if (result && result.trim() && result.trim() !== src.trim()) return result.trim()
    } catch {}
  }
  return src
}

async function translateAll() {
  const texts = []
  const lineMap = []
  for (const pg of pagesData.value) {
    for (let li = 0; li < pg.lines.length; li++) {
      texts.push(pg.lines[li].text)
      lineMap.push({ page: pg.page, li })
    }
  }
  if (!texts.length) { showToast('没有可翻译的内容'); return }
  translating.value = true; errorMsg.value = ''; translateProgress.value = 0
  const map = {}
  let done = 0
  try {
    for (let i = 0; i < texts.length; i += 3) {
      const batch = texts.slice(i, i + 3).map(async (text, j) => {
        const result = await translateOne(text)
        const { page, li } = lineMap[i + j]
        if (!map[page]) map[page] = {}
        if (result && result !== text) map[page][li] = result
        done++
        translateProgress.value = Math.round(done / texts.length * 100)
      })
      await Promise.all(batch)
    }
    translatedMap.value = map
  } catch (e) {
    errorMsg.value = '翻译失败: ' + e.message
  }
  translating.value = false; translateProgress.value = 0
}

function onLeftScroll() {
  if (syncScroll) { syncScroll = false; return }
  syncScroll = true
  if (rightScroll.value) rightScroll.value.scrollTop = leftScroll.value.scrollTop
}
function onRightScroll() {
  if (syncScroll) { syncScroll = false; return }
  syncScroll = true
  if (leftScroll.value) leftScroll.value.scrollTop = rightScroll.value.scrollTop
}

function resetAll() {
  file.value = null; pdfDoc = null; pagesData.value = []; translatedMap.value = {}
  pdfReady.value = false; totalPages.value = 0; errorMsg.value = ''
  canvasRefs = {}; rightCanvasRefs = {}
}
</script>

<style scoped>
.app-wrap{display:flex;flex-direction:column;height:100vh;background:#f0f2f5}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:44px;background:#fff;border-bottom:1px solid #e8e8e8;flex-shrink:0}
.topbar-left{display:flex;align-items:center;gap:8px}
.logo-dot{width:8px;height:8px;border-radius:50%;background:#1989fa}
.logo-text{font-size:15px;font-weight:600;color:#323233}
.nav-btn{background:transparent;color:#666;border:1px solid #d9d9d9;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;text-decoration:none}
.nav-btn:hover{color:#1989fa;border-color:#1989fa}
.tl-main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.tl-upload-area{flex:1;display:flex;align-items:center;justify-content:center}
.tl-upload-box{border:2px dashed #d9d9d9;border-radius:16px;padding:60px 80px;text-align:center;cursor:pointer;background:#fff;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:8px}
.tl-upload-box:hover{border-color:#1989fa;background:#f5f8ff}
.tl-upload-icon{font-size:48px}
.tl-upload-text{font-size:15px;color:#555}
.tl-upload-sub{font-size:12px;color:#bbb}
.tl-workspace{flex:1;display:flex;flex-direction:column;overflow:hidden}
.tl-toolbar{display:flex;align-items:center;gap:8px;padding:8px 20px;background:#fff;border-bottom:1px solid #e8e8e8;flex-shrink:0}
.tl-file-info{font-size:13px;color:#555;font-weight:500}
.tl-toolbar-actions{display:flex;align-items:center;gap:8px;margin-left:auto}
.tl-btn{padding:5px 14px;border-radius:5px;font-size:12px;cursor:pointer;border:1px solid #d9d9d9;background:#fff;color:#666;font-family:inherit;transition:all .15s}
.tl-btn:hover:not(:disabled){color:#1989fa;border-color:#1989fa}
.tl-btn.primary{background:#1989fa;color:#fff;border-color:#1989fa}
.tl-btn:disabled{opacity:.5;cursor:not-allowed}
.tl-error-bar{background:#fff0f0;color:#e53935;padding:8px 16px;font-size:12px;border-bottom:1px solid #ffcdd2}
.tl-columns{flex:1;display:flex;overflow:hidden}
.tl-col{flex:1;display:flex;flex-direction:column;overflow:hidden}
.tl-original-panel{border-right:2px solid #e8e8e8;background:#f5f5f5}
.tl-translation-panel{background:#f0f2f5}
.tl-panel-title{font-size:13px;font-weight:600;color:#555;padding:8px 16px;background:#fafafa;border-bottom:1px solid #e8e8e8;flex-shrink:0}
.tl-scroll{flex:1;overflow-y:auto;padding:16px}
.tl-page-wrap{background:#fff;margin-bottom:20px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:visible}
.tl-page-label{background:#e3f2fd;color:#1565c0;font-size:11px;font-weight:600;padding:4px 12px}
.tl-pdf-canvas{display:block;max-width:100%}
.tl-canvas-wrap{position:relative;overflow:visible}
.tl-overlay-item{
  position:absolute;
  background:rgba(255,255,255,0.96);
  color:#1a1a2e;
  white-space:nowrap;
  font-family:'Microsoft YaHei','PingFang SC','SimSun',sans-serif;
  padding:0 2px;
  box-sizing:border-box;
}
.tl-loading-state{text-align:center;padding:40px;color:#999;font-size:13px}
.tl-placeholder{text-align:center;padding:40px;color:#bbb;font-size:13px}
</style>
