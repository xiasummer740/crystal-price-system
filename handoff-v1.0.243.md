# v1.0.243 交接说明（下次接力先看这份）

> 2026-10-23 · 线上最新 **v1.0.243** · https://github.com/xiasummer740/crystal-price-system/releases/tag/v1.0.243

## 这轮做了什么（v1.0.239 → v1.0.243）

| 版本 | 内容 | 备注 |
|---|---|---|
| 1.0.239 | 生成订单（供货合同）首版 | **当天撤回**：安装版启动失败，见下节 |
| 1.0.240 | 修打包 + 订单页正式可用 | 关 asar + `extraResources` 补 9 个依赖 |
| 1.0.241 | 订单页去掉「测试版」标记 | |
| 1.0.242 | 客户物料：料号+报价一键复制、规格书复制文件、表头列分割线 | |
| 1.0.243 | 备注图片/文件可切换图集 | 本轮最后一版 |

## 订单模块（v1.0.240 起稳定）

**入口**：首页 / 客户物料页「🧾 生成订单」→ `OrderForm.vue`。

**后端**

- `server/src/utils/orderDoc.js`：用 ExcelJS 生成合同 xlsx
  - A4 纵向、`scale 93`、7 列固定列宽、黑体 12（patch `styles.xml` fonts[0] 默认字体）
  - 公章锚点（祥哥确认）：`nativeCol 1, nativeColOff 52705, nativeRow sigRow-1, nativeRowOff 247650`，140×140px
  - logo：A1 右移 4px/下移 2px，230×143px；行高按内容收紧（4 条物料一页）
  - `priceMode` 含税/未税只改表头「金额（含税/未税）」，不做换算
- `server/src/utils/orderNumber.js`：去地区/行业词 + 拼音首字母 → `GR261022001`
- `server/src/utils/xlsxToPdf.js`：PowerShell → Excel COM `ExportAsFixedFormat`，串行队列
  - 没装 Office 时只出 xlsx，返回 `pdfError`，前端提示原因
- `server/src/routes/orders.js`：`/options` `/generate` `/preview`（不落盘）/`/list` `/download` `/copy` `/open` `/seal` `/defaults`
- 客户默认资料：`customers.short_name` + `customers.order_profile` JSON
  - `{ fileShort, priceMode, buyer:{address,contact,phone,fax}, terms:{deliveryPlace,freight,acceptance,settlement} }`
- 文件落位：`<DATA_DIR>/客户管理/<客户名>/订单/<客户简称>-晶科鑫订单<单号>.xlsx / .pdf`

**前端**

- `client/src/views/OrderForm.vue`
  - 顶部：💾 保存默认 / 👁 预览 / 🧾 生成订单文件
  - 预览：左侧小窗，点击放大（100%），点空白或 Esc 关闭；预览不落盘、不占号
  - 历史订单每单一条 PDF：浏览器预览 / 复制文件 / 下载
- `client/src/utils/api.js`：`previewOrder`、`copyOrderFile` 等

**测试**

```bash
node --test tests/order-doc.test.js      # 10 条
node --test tests/order-number.test.js   # 11 条
```

## 🔥 打包坑（v1.0.239 事故，别再踩）

现象：安装版双击后闪退；日志 `Incoming server import failed: Cannot find module 'call-bind-apply-helpers'`。

原因：npm 把 express 的传递依赖 dedupe 到了 electron-builder 的 dev 树里，
electron-builder 25 收集 production 依赖时漏掉 9 个包：
`archiver-utils / call-bind-apply-helpers / encoding / es-abstract-get / iconv-lite /
side-channel-list / side-channel-map / side-channel-weakmap / tesseract.js-core`。

修复（`package.json` build，已生效）：

```json
"asar": false,
"extraResources": [
  { "from": "node_modules/<pkg>", "to": "app/node_modules/<pkg>" }, ...
],
"dependencies": { "call-bind-apply-helpers": "^1.0.2", ... }
```

> 以后新增依赖后打包，**必须实际启动 win-unpacked 里的 exe 并打一次接口**，
> 不能只看 electron-builder 退出码。

## 测试启动打包版（本机必看）

这个环境里 `ELECTRON_RUN_AS_NODE=1` 是继承的，直接 `Start-Process` 会让 Electron 当 Node 跑、
瞬间退出（exit 0，无日志）。验证前先：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:DATA_DIR='D:\dsh-workspace\晶振报价软件\_pkgtest'
Start-Process 'dist-exe\win-unpacked\晶振报价管理系统.exe'
# 然后再 curl http://127.0.0.1:3266/api/orders/options
```

沙箱跑完核对 `%APPDATA%\crystal-price-system\user-config.json` 的 `dataDir` 仍是生产目录
（本次核对：`D:\software\晶振报价管理系统`，未变）。

## 物料复制 / 预览（v1.0.242–243）

- 料号+报价：报价格里的「⧉」，复制 `料号  报价`（**两个空格**）
- 规格书：编辑弹窗「📋 复制」→ 后端 `POST /api/materials/copy-file` → PowerShell `Set-Clipboard -Path`
- 备注图集：`client/src/components/RemarkPreview.vue`
  - 左右箭头 / 键盘 ← → / 手机滑动 / 缩略图
  - 非图片（PDF/Word/Excel）显示文件卡片：打开 / 复制文件
  - 只在桌面版或 localhost 显示「复制文件」

## 下次可以继续做的事

1. 订单：多客户批量生成、订单列表页（目前只有单客户历史）
2. 物料：多选多行一起复制「料号+报价」
3. 备注图集：图片旋转/缩放；手机端长按保存
4. 打包：把 `extraResources` 的 9 个包做成脚本自动探测（新增依赖时不用手补）

## 当前状态

- 线上 **v1.0.243**，安装包 / blockmap / latest.yml 已上传
- 测试：order-doc 10/10、order-number 11/11；打包版启动 + `/api/orders/options` 200 + 备注图集切换 1/2→2/2 均验过
- 生产配置未动（`dataDir = D:\software\晶振报价管理系统`）
