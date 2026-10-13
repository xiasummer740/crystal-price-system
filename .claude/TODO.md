# 🛑 停工快照（手写，非自动生成）

> 2026-09-28 收工 · 当前版本 **v1.0.220（已发版）**

**停在哪**：v1.0.220 全流程走完——开发 ✅ 单测 ✅ 真机验证 ✅ 独立对抗复审 ✅ 发版 ✅。
无半截活。详细交接见根目录 `handoff-v1.0.220.md`。

**下次开工第一件事**：**问祥哥另一台电脑装 220 的结果**——
① 装完能正常打开吗？② 还卡启动动画的话，要 `logs\startup.log`。

**从哪读起**：`handoff-v1.0.220.md`（本次全记录）→ `PROGRESS.md` 头部（v1.0.220 段）。

**红线提醒**：跑 Electron 一律带 `DATA_DIR=<沙箱>`；启动后先查日志的 `Window bounds:`
确认开的是沙箱再动手。对照实验写纯 Node 单元探针，**不许**起真 Electron 凑对照。

---

# 技术债务清单

> 自动追踪自 2026-08-17

- [ ] `F:\summer\vs-code\crystal-price-system\server\src\db.js:164` — status          TEXT DEFAULT 'todo',
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\index.js:328` — const r = execute(`UPDATE notes SET status = 'todo' WHERE status = 'in_progress' AND is_deleted = 0`)
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:404` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:180` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:219` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:394` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:181` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:220` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:178` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:217` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\client\src\views\NoteForm.vue:164` — const statusLabel = computed(() => ({ todo: '待办', done: '已完成', follow_up: '跟进后续' })[form.status] || '待办')
- [ ] `F:\summer\vs-code\crystal-price-system\client\src\views\NoteDetail.vue:51` — {{ {todo:'待办',done:'已完成',follow_up:'跟进后续'}[note.status] || '待办' }}
- [ ] `F:\summer\vs-code\crystal-price-system\client\src\views\NoteDetail.vue:78` — {{ {todo:'待办',done:'已完成',follow_up:'跟进后续'}[u.status] || '' }}
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:185` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:224` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:187` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\export.js:226` — const statusMap = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:409` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:416` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:435` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:438` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:439` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:440` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:452` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:464` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:467` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:468` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:469` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:476` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
- [ ] `F:\summer\vs-code\crystal-price-system\server\src\utils\archiveSync.js:478` — const STATUS_TEXT = { todo: '待办', done: '已完成', follow_up: '跟进后续' }
