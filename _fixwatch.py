p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
watch_line="watch(() => [form.value.material_code, form.value.jkx_code], scheduleQuoteRef)\n"
assert watch_line in s
s=s.replace(watch_line,"",1)
anchor="function openForm(item) {"
assert anchor in s
s=s.replace(anchor, watch_line+anchor, 1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("moved")
