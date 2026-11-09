p="client/src/views/CompanyDocs.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''function onDragOver(e) {
  // 只在真的拖了文件时才亮遮罩（拖选中文字不该触发）
  if (!e.dataTransfer?.types?.includes('Files')) return''','''function onDragOver(e) {
  // 文件夹组件内部自己处理拖拽，父级不要再拦（否则会重复上传到「未分类」）
  if (e.target?.closest?.('.cdf')) return
  // 只在真的拖了文件时才亮遮罩（拖选中文字不该触发）
  if (!e.dataTransfer?.types?.includes('Files')) return''',1)
s=s.replace('''function onDrop(e) {
  dragDepth = 0
  dragging.value = false''','''function onDrop(e) {
  if (e.target?.closest?.('.cdf')) return
  dragDepth = 0
  dragging.value = false''',1)
s=s.replace('''function onPaste(e) {
  const items = [...(e.clipboardData?.items || [])]''','''function onPaste(e) {
  if (e.target?.closest?.('.cdf')) return
  const items = [...(e.clipboardData?.items || [])]''',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
