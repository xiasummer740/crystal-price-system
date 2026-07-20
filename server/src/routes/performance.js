import { Router } from "express";
import { queryAll, queryOne, execute } from "../db.js";

const router = Router();

// 获取列表（按月查询）
router.get("/reviews", (req, res) => {
  const { month } = req.query;
  let sql = "SELECT * FROM performance_reviews";
  const params = [];
  if (month) {
    sql += " WHERE month = ?";
    params.push(month);
  }
  sql += " ORDER BY month DESC, id ASC";
  const rows = queryAll(sql, params);
  res.json({ code: 0, data: rows });
});

// 获取单条
router.get("/reviews/:id", (req, res) => {
  const row = queryOne("SELECT * FROM performance_reviews WHERE id = ?", [
    Number(req.params.id),
  ]);
  if (!row) return res.status(404).json({ code: 1, msg: "记录不存在" });
  res.json({ code: 0, data: row });
});

// 保存（先删后插，简单可靠的 upsert）
router.post("/reviews", (req, res) => {
  const b = req.body;
  if (!b.month) return res.status(400).json({ code: 1, msg: "月份不能为空" });
  try {
    // 先删该月已有记录
    execute("DELETE FROM performance_reviews WHERE month = ?", [b.month]);
    // 再插入新数据
    const r = execute(
      "INSERT INTO performance_reviews (month, scores, deductions, total_score) VALUES (?, ?, ?, ?)",
      [
        b.month,
        JSON.stringify(b.scores || {}),
        JSON.stringify(b.deductions || []),
        b.total_score || 0,
      ],
    );
    res.json({ code: 0, data: { id: r.lastInsertRowid }, msg: "保存成功" });
  } catch (e) {
    console.error('[performance] save error:', e.message);
    res.status(500).json({ code: 1, msg: '保存失败: ' + e.message });
  }
});

// 删除
router.delete("/reviews/:id", (req, res) => {
  execute("DELETE FROM performance_reviews WHERE id = ?", [
    Number(req.params.id),
  ]);
  res.json({ code: 0, msg: "删除成功" });
});

export default router;
