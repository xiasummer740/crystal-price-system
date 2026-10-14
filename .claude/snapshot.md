## 🏷️ 架构快照

> ⚠️ **本文件是旧版自动快照，已不再更新**（停在 2026-07-06）。
> **接手请看 `.claude/TODO.md`**（停工快照/下一步）+ 根目录**最新的 `handoff-v1.0.*.md`**（逐版全记录）。
> 保留本文件只为兼容旧流程；下面的「代码库摘要」是当时的，不要当现状。

- **最后更新**: 2026-07-06 20:01（已过期）
- **当前版本**: v1.0.226（2026-10-14）
- **接力入口**: `.claude/TODO.md` → `handoff-v1.0.226.md`

## 📋 接手三步（2026-10-14 更新）

1. 读 `.claude/TODO.md` 顶部「下个对话从这里接着干」
2. 读根目录最新的 `handoff-v1.0.NNN.md`（当前 = `handoff-v1.0.226.md`）
3. 开工前确认环境：`$env:DATA_DIR` 必须指向沙箱（`dev-data`）才起 Electron；见项目 `CLAUDE.md`「沙箱测试红线」

## 🗺️ 当时的代码库摘要（仅存档，可能已过时）

  server/src/routes/map.js  →  const router = Router();; router.get("/customers", (req, res) => {; const keyword = (req.query.keyword || "").trim();; const params = []; const kw = `%${keyword}%`;
  server/src/index.js  →  const __dirname = path.dirname(fileURLToPath(import.meta.url)); const app = express(); const PORT = process.env.PORT || 3266; app.use(cors({; const allowed = ['http://localhost', 'http://127.0.0.1', 'http://192.168.', 'http://10.', 'http://172.']
  server/src/db.js  →  const __dirname = path.dirname(fileURLToPath(import.meta.url)); const dataDir = process.env.DATA_DIR || path.join(__dirname, '..'); const dbDir = path.join(dataDir, '数据库'); const dbPath = path.join(dbDir, 'data.db');
  server/src/routes/notes.js  →  function cleanNote(row) {; const router = Router(); const notesUploadDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..', '..'), '记事图片库')
  server/src/routes/materials.js  →  客户物料 CRUD + 导入导出 + 状态清单 + 进展时间线（v1.0.223 起）
  server/src/utils/customerNames.js  →  客户名统一名册（并集读 + 各录入点回填）
  server/src/utils/materialEvents.js / materialTimeline.js / materialDwell.js  →  物料进展流水、时间线聚合、停留时长（v1.0.223~225）
  server/src/routes/customers.js  →  客户名册管理（删除/合并，v1.0.222）

## ⚡ 建议操作

- [ ] 继续当前会话开发
- [ ] 重开新对话 → **把 `.claude/TODO.md` 发给 AI**（不是本文件）
