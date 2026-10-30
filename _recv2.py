p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

# 条：收件人姓名+电话+地址
old='''        <span class="as-label">📦 收货地址</span>
        <template v-if="customerAddresses.length">
          <span class="as-item" :title="customerAddresses[0].address" @click="copyText(customerAddresses[0].address)">
            <b v-if="customerAddresses[0].is_default">默认 · </b>{{ customerAddresses[0].address }}
          </span>'''
new='''        <span class="as-label">👤 收件人</span>
        <template v-if="customerAddresses.length">
          <span class="as-item" :title="recipientText(customerAddresses[0])" @click="copyText(recipientText(customerAddresses[0]))">
            <b v-if="customerAddresses[0].is_default">默认 · </b>
            <b v-if="customerAddresses[0].name">{{ customerAddresses[0].name }}</b>
            <span v-if="customerAddresses[0].phone"> {{ customerAddresses[0].phone }}</span>
            <span v-if="customerAddresses[0].address"> · {{ customerAddresses[0].address }}</span>
          </span>'''
assert old in s
s=s.replace(old,new,1)

# 空态
s=s.replace('''<span v-else class="as-empty">还没有收货地址</span>''','''<span v-else class="as-empty">还没有收件人信息</span>''',1)

# 弹层标题/内容
s=s.replace('''<h4>收货地址 <small>{{ selectedCustomer }}</small></h4>
          <div v-if="!customerAddresses.length" class="ap-empty">还没有收货地址，点「管理地址」去地图页添加</div>''','''<h4>收件人信息 <small>{{ selectedCustomer }}</small></h4>
          <div v-if="!customerAddresses.length" class="ap-empty">还没有收件人信息，点「管理地址」去地图页添加</div>''',1)
s=s.replace('''              <div class="ap-name">{{ a.label }}<span v-if="a.is_default" class="ap-default">默认</span></div>
              <div class="ap-addr">{{ a.address }}</div>
              <div class="ap-contact" v-if="a.contact">{{ a.contact }}</div>''','''              <div class="ap-name">
                <span v-if="a.name">{{ a.name }}</span>
                <span v-else>{{ a.label }}</span>
                <span v-if="a.phone" class="ap-phone">{{ a.phone }}</span>
                <span v-if="a.is_default" class="ap-default">默认</span>
              </div>
              <div class="ap-addr">{{ a.address }}</div>
              <div class="ap-contact" v-if="a.label && a.name">{{ a.label }}</div>''',1)
s=s.replace('''<button class="ap-copy" @click="copyText(a.address)">复制</button>''','''<button class="ap-copy" @click="copyText(recipientText(a))">复制</button>''',1)

# 函数
s=s.replace('''async function loadCustomerAddresses(name) {''','''function recipientText(a) {
  if (!a) return ''
  return [a.name, a.phone, a.address].filter(Boolean).join(' ')
}

async function loadCustomerAddresses(name) {''',1)

# CSS 电话
s=s.replace(".ap-name { font-size: 13px; color: #1f2937; }", ".ap-name { font-size: 13px; color: #1f2937; }\n.ap-phone { margin-left: 8px; color: #475467; font-size: 12px; }",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
