# v1.0.244 交接（订单删除 + 编码/规格记忆）

> 2026-10-26 · 已打包、已本地提交；**GitHub 推送/Release 待网络恢复后补**
> 安装包：`dist-exe\crystal-price-system-setup-1.0.244.exe`（可直接双击安装）

## 这一版做了什么

### 1. 历史订单可删除

- 订单页「该客户的历史订单」每条后面新增「删除」
- 二次确认后，**xlsx + pdf 一起删**（按同名 stem）
- 删除只允许动该客户 `客户管理/<客户>/订单/` 目录里的文件：
  服务端 `POST /api/orders/delete` 先 `path.basename`，再按 stem 拼 `.xlsx/.pdf`，不信任前端路径
- 已实测：打包版生成一单 → 删除 → 两个文件都没了，历史行消失

### 2. 货品编码 / 产品规格按物料记住

- 生成订单时，把每行**手改过的** `code`（货品编码）和 `spec`（产品规格）写回该物料：
  `customer_materials.order_code / order_spec`（新增两列，启动时自动 ALTER）
- 下次选同一个物料：有 `order_code` 就直接带入并停止自动编号；有 `order_spec` 就用它，
  没有才按「料号/工厂 + 名称」拼
- 触发点：点「生成订单」时保存（预览不保存）；界面提示「改过的编码/规格会记住」
- 已实测：改 `TESTCODE-9` + `TEST SPEC 测试规格` → 生成 → 重进页面选同一物料，两个值自动带入

## 关键改动文件

- `server/src/db.js`：`customer_materials` 加 `order_code` / `order_spec`
- `server/src/routes/orders.js`
  - `customerMaterials()` SELECT 带两列
  - `cleanItems` 带 `materialId`；生成成功后 `UPDATE customer_materials ...`
  - 新增 `POST /orders/delete`
- `client/src/views/OrderForm.vue`：删除按钮 + 确认框、`onMaterialPick` 带入记忆、payload 带 `materialId`
- `client/src/utils/api.js`：`deleteOrder()`

## 发版进度（网络问题）

2026-10-26 14:36 起 `github.com` / `api.github.com` 全部连不上（百度正常，TLS EOF），
`git push` 失败。本地已：

- `npm run package` 成功 → `dist-exe\crystal-price-system-setup-1.0.244.exe`
- commit `v1.0.244` + tag 已打（本地）

网络恢复后执行：

```powershell
cd crystal-price-system
git push origin HEAD; git push origin v1.0.244
# 再用 GitHub Release 上传：
# dist-exe\crystal-price-system-setup-1.0.244.exe
# dist-exe\crystal-price-system-setup-1.0.244.exe.blockmap
# dist-exe\latest.yml
```

## 测试记录

- 开发版：生成（materialId=280，code=TESTCODE-9，spec=TEST SPEC 测试规格）→ options 回读一致
- 开发版 UI：重新选物料自动带入 code/spec；历史行「删除」→ 确认 → 行消失、文件删除
- 打包版：启动 200；选物料带入 `TESTCODE-9` / `TEST SPEC…`；生成后调 `/orders/delete` 返回删除两个文件
- 注意：`ELECTRON_RUN_AS_NODE` 在验证前必须清掉，否则 Electron 当 Node 跑、秒退

## 下次可以接着做

1. 物料多选批量复制「料号+报价」
2. 订单列表页（跨客户）
3. 备注图集：缩放/旋转
