## 🏷️ 架构快照
- **时间**: 2026-07-06 20:01
- **提交**: docs: 更新PROGRESS.md + 地图搜索方案归档到记忆
- **文件**: PROGRESS.md, portable.err

## 📋 未完成项
- [ ]（从 PROGRESS.md 或记忆读取）

## 🗺️ 代码库摘要
  server/src/routes/map.js  →  const router = Router();; router.get("/customers", (req, res) => {; const keyword = (req.query.keyword || "").trim();; const params = [];; const kw = `%${keyword}%`;
  server/src/index.js  →  const __dirname = path.dirname(fileURLToPath(import.meta.url)); const app = express(); const PORT = process.env.PORT || 3266; app.use(cors({; const allowed = ['http://localhost', 'http://127.0.0.1', 'http://192.168.', 'http://10.', 'http://172.']
  server/src/db.js  →  const __dirname = path.dirname(fileURLToPath(import.meta.url)); const dataDir = process.env.DATA_DIR || path.join(__dirname, '..'); const dbDir = path.join(dataDir, '数据库'); const dbPath = path.join(dbDir, 'data.db'); export async function initDb() {
  server/src/routes/reports.js  →  const router = Router(); function calcRange(range) {; const now = new Date(); const pad = (n) => String(n).padStart(2, '0'); const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  server/src/routes/notes.js  →  function cleanNote(row) {; const __dirname = path.dirname(fileURLToPath(import.meta.url)); const router = Router(); const notesUploadDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..'), '记事图片库'); const fileUpload = multer({
  server/src/routes/logs.js  →  const router = Router(); router.get('/', (_req, res) => {; const files = logger.listLogFiles(); router.get('/:filename', (req, res) => {; const { filename } = req.params
  server/src/utils/logger.js  →  const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 }; const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.INFO; function getLogDir() {; const base = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); function logFilePath() {
  server/scripts/import-customers.js  →  const __dirname = path.dirname(fileURLToPath(import.meta.url)); const xlsxPath = 'F:/下载/销售出.xlsx'; const wb = XLSX.readFile(xlsxPath); const ws = wb.Sheets[wb.SheetNames[0]]; const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
  server/src/routes/samples.js  →  const router = Router(); const upload = multer({ storage: multer.memoryStorage() }); router.get('/', (req, res) => {; const { page=1, pageSize=50, keyword, factory, brand, sortBy='created_at', sortOrder='DESC', multiFilter } = req.query; const conditions = ['is_deleted = 0']
  server/src/routes/prices.js  →  const router = Router(); function parseMultiFilter(multiStr, alias = '') {; const pfix = alias ? alias + '.' : ''; const conditions = []; const params = []; const allowed = ['material_code','material_name','material_spec','category','brand','dimension','pin_count','frequency',
  server/src/utils/export.js  →  const __dirname = path.dirname(fileURLToPath(import.meta.url)); function parseExcelDate(v) {; const ms = Math.round((v - 25569) * 86400 * 1000); const d = new Date(ms); const s = String(v).trim()

## ⚡ 建议操作
- [ ] 继续当前会话开发
- [ ] 重开新对话 → 把本文件发给 AI
