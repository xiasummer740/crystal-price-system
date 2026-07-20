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

// 创建
router.post("/reviews", (req, res) => {
  const b = req.body;
  if (!b.month) return res.status(400).json({ code: 1, msg: "月份不能为空" });
  try {
    const r = execute(
      `INSERT INTO performance_reviews (month, employee_name, department, position, scores, deductions, total_score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        b.month,
        b.employee_name || "",
        b.department || "",
        b.position || "",
        JSON.stringify(b.scores || {}),
        JSON.stringify(b.deductions || []),
        b.total_score || 0,
      ],
    );
    res.json({ code: 0, data: { id: r.lastInsertRowid } });
  } catch (e) {
    throw e;
  }
});

// 更新
router.put("/reviews/:id", (req, res) => {
  const existing = queryOne("SELECT * FROM performance_reviews WHERE id = ?", [
    Number(req.params.id),
  ]);
  if (!existing) return res.status(404).json({ code: 1, msg: "记录不存在" });
  const b = req.body;
  execute(
    `UPDATE performance_reviews SET month=?, employee_name=?, department=?, position=?, scores=?, deductions=?, total_score=?, updated_at=datetime('now','localtime') WHERE id=?`,
    [
      b.month ?? existing.month,
      b.employee_name ?? existing.employee_name,
      b.department ?? existing.department,
      b.position ?? existing.position,
      b.scores ? JSON.stringify(b.scores) : existing.scores,
      b.deductions ? JSON.stringify(b.deductions) : existing.deductions,
      b.total_score ?? existing.total_score,
      Number(req.params.id),
    ],
  );
  res.json({ code: 0, msg: "保存成功" });
});

// 删除
router.delete("/reviews/:id", (req, res) => {
  execute("DELETE FROM performance_reviews WHERE id = ?", [
    Number(req.params.id),
  ]);
  res.json({ code: 0, msg: "删除成功" });
});

export default router;
