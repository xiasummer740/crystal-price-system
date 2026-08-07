# 接力文档 v1.0.211

> 🔴 修复报价备注微信粘贴无效（@paste 绑在 Vant Field 上不透传），最新 tag: v1.0.211

## 当前状态

**v1.0.211**，GitHub Release 三件套齐全（exe + blockmap + latest.yml）。工作区干净，全部已推送。

## 问题

祥哥反馈：v1.0.210 报价备注微信截图后 Ctrl+V 粘贴没反应。

## 根因

`@paste` 事件绑在 `<van-field>` 组件上。**Vant Field 组件不透传自定义事件**——它内部 `inputAttrs` 只声明了 onBlur/onFocus/onInput/onClick/onChange/onKeypress 等固定事件，`@paste` 作为组件 attrs 落到组件根元素，但事件流不可靠（用户聚焦 textarea 粘贴时，事件没有正确到达）。

之前的浏览器验证用**合成事件**（page.evaluate dispatch）绕过了真实事件流，误判为通过。

## 修复

把 `@paste` 从 `<van-field>` 移到外层自定义 div `.remark-zone` 上：

```html
<!-- 修复前：@paste 在 van-field 上（不透传） -->
<van-field ... @paste="onRemarkPaste" />

<!-- 修复后：@paste 在 remark-zone 上，textarea paste 事件冒泡捕获 -->
<div class="remark-zone" @dragover.prevent @drop.prevent="onRemarkDrop" @paste="onRemarkPaste">
  <van-field ... />
</div>
```

textarea 的 paste 事件冒泡到 remark-zone，100% 可靠。onRemarkPaste 内部只在检测到文件时才 `preventDefault()`，纯文本粘贴不受影响。

## 验证（真实粘贴，非合成事件）

用 **CDP 剪贴板**（navigator.clipboard.write 写入图片 + grantPermissions 授权 + 真实 Ctrl+V 键盘事件）验证：
- 剪贴板写入图片 → 聚焦备注 textarea → 按 Ctrl+V → **图片成功上传**（toast「已上传 1 个文件」）✅

## 踩坑

- **🔴 浏览器事件验证必须用真实事件流**：合成事件（page.evaluate dispatch）会绕过真实事件绑定问题，导致假阳性。粘贴/键盘类功能需用 CDP 剪贴板 + 真实 key 事件验证
- **🔴 Vant Field 不透传自定义事件**：`@paste`/`@drop`/`@keydown` 等自定义事件不要绑在 `<van-field>` 组件上，应绑到外层自定义 DOM 元素
- NoteForm 的 `@paste` 绑在自定义 `.upload-area` div 上，所以记事粘贴一直正常——报价实现当初绑错了位置

## 关键文件

| 文件 | 说明 |
|------|------|
| `client/src/views/AddRecord.vue` | @paste 移到 remark-zone div |

相关记忆：[[handoff-v1.0.210]] [[browser-verify-rule]]
