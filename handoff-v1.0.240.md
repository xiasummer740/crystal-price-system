# v1.0.240 — 生成订单（供货合同）

> 2026-10-23 发布 · https://github.com/xiasummer740/crystal-price-system/releases/tag/v1.0.240

## 一句话

客户物料页 / 首页「🧾 生成订单」→ 选客户 → 带出乙方资料与物料 → 生成 **Excel + PDF** 到
`客户管理\<客户>\订单\`，文件名 `<客户简称>-晶科鑫订单<单号>.xlsx / .pdf`。

## 功能

- **模板**：按祥哥样张 `靖邦-晶科鑫订单JB260310001.xls` 复刻（A4、93%、7 列、条款二~十、双方签章）
- **公章**：公司公章（来自 `D:\夏天\客户资料\晶科鑫报价单2026-5-20后.docx`，带五角星）；
  位置按祥哥示例（colOff 52705 / rowOff 247650 EMU）压一点文字；可上传替换 / 恢复默认
- **左上角 SJK logo**：230×143 px，A1 右移 4px、下移 2px
- **货品编码**默认 1、2、3…（可手改）；**含税/未税**切换（只改表头，不换算）；
  **交货时间**自由文本（空 / 2周 / 2-3周）
- **单号**：`简称 + YYMMDD + 001~999`；简称自动猜（去地区/行业词取拼音首字母），可改并按客户记住
- **保存默认**（顶部）：甲方全局；乙方 / 条款 / 简称 / 价格口径绑定到客户（`customers.order_profile`）
- **生成前预览**：左侧小窗 → 点击放大（100%）→ 点空白/ESC 关闭；不落盘、不占单号
- **历史订单**：每单一行 PDF，点名字浏览器预览，「复制」把文件放进系统剪贴板（可粘微信）
- **行高**：按内容收紧，4 条物料实测 1 页

## 打包修复（重要）

v1.0.239 的安装版启动即退出：electron-builder 25 的 production 依赖收集漏掉了
`call-bind-apply-helpers` / `es-abstract-get` / `side-channel-*` 等 9 个包（npm 把 express 的
传递依赖 dedupe 到了 electron-builder 的 dev 树里）。表现为：
`Cannot find module 'call-bind-apply-helpers'` → 服务模块加载失败 → 闪屏关闭。

修复（`package.json` build）：

- `"asar": false` —— 不再打 asar，避免 asar 内模块解析的额外不确定性
- `"extraResources"` 显式补上被漏掉的 9 个包到 `app/node_modules/...`
- 依赖里加 `call-bind-apply-helpers`

验证：用 `DATA_DIR` 沙箱启动打包版 → `/api/orders/options` 200（pinyin 猜测正常）→
`/api/orders/preview` 返回 200 PDF（ExcelJS + Excel COM 正常）。

## 已知限制

- 复制文件走系统剪贴板，只在 Windows 桌面版/本机浏览器显示（手机浏览器不给按钮）
- PDF 依赖本机 Excel 导出；没装 Office 时只出 xlsx，界面提示原因
- 「保存默认」里条款按客户存；没存过时用全局默认

## 测试

- `tests/order-doc.test.js` 10 条、`tests/order-number.test.js` 11 条，全过（后端 201+）
- 真机页面：选客户 → 自动带出 → 预览 → 生成 → 下载/复制 PDF；4 条物料一页
