p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''<span v-if="customerAddresses[0].phone"> {{ customerAddresses[0].phone }}</span>''','''<span v-if="customerAddresses[0].phone" class="as-phone">{{ customerAddresses[0].phone }}</span>''',1)
s=s.replace(".as-more { color:", ".as-phone { margin-left: 5px; color: #475467; }\n.as-more { color:",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
