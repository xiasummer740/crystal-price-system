p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''<div class="ap-contact" v-if="a.label && a.name">{{ a.label }}</div>''','''<div class="ap-contact" v-if="a.type === 'site' && a.label && a.name && a.label !== a.name">{{ a.label }}</div>''',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
