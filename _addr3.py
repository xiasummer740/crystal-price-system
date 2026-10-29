p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

# 模板：收货地址条 + 弹层
old='''      <!-- 未选择客户：显示客户列表入口 -->'''
new='''      <!-- 收货地址（来自地图地址页，直接在此复制） -->
      <div v-if="selectedCustomer" class="addr-strip">
        <span class="as-label">📦 收货地址</span>
        <template v-if="customerAddresses.length">
          <span class="as-item" :title="customerAddresses[0].address" @click="copyText(customerAddresses[0].address)">
            <b v-if="customerAddresses[0].is_default">默认 · </b>{{ customerAddresses[0].address }}
          </span>
          <span v-if="customerAddresses.length > 1" class="as-more" @click="showAddrPanel = true">+{{ customerAddresses.length - 1 }} 个</span>
        </template>
        <span v-else class="as-empty">还没有收货地址</span>
        <button class="as-manage" @click="goMapAddresses">管理地址</button>
      </div>

      <van-popup v-model:show="showAddrPanel" position="bottom" round :style="{ maxHeight: '60%' }">
        <div class="addr-panel">
          <h4>收货地址 <small>{{ selectedCustomer }}</small></h4>
          <div v-if="!customerAddresses.length" class="ap-empty">还没有收货地址，点「管理地址」去地图页添加</div>
          <div v-for="(a, i) in customerAddresses" :key="i" class="ap-row">
            <div class="ap-main">
              <div class="ap-name">{{ a.label }}<span v-if="a.is_default" class="ap-default">默认</span></div>
              <div class="ap-addr">{{ a.address }}</div>
              <div class="ap-contact" v-if="a.contact">{{ a.contact }}</div>
            </div>
            <button class="ap-copy" @click="copyText(a.address)">复制</button>
          </div>
        </div>
      </van-popup>

      <!-- 未选择客户：显示客户列表入口 -->'''
assert old in s
s=s.replace(old,new,1)

# 导入
s=s.replace("fetchLatestQuote, isLocalFileUrl", "fetchLatestQuote, fetchCustomerAddresses, isLocalFileUrl", 1)

# 状态
s=s.replace("const syncingCost = ref(false)","const syncingCost = ref(false)\nconst customerAddresses = ref([])\nconst showAddrPanel = ref(false)",1)

# 函数：加载 + 跳转
old3='''function selectCustomer(name, carryKeyword) {'''
new3='''async function loadCustomerAddresses(name) {
  if (!name) { customerAddresses.value = []; return }
  try {
    const r = await fetchCustomerAddresses(name)
    customerAddresses.value = r.data || []
  } catch { customerAddresses.value = [] }
}
function goMapAddresses() {
  if (!selectedCustomer.value) return
  router.push({ path: '/map-addresses', query: { q: selectedCustomer.value } })
}

function selectCustomer(name, carryKeyword) {'''
assert old3 in s
s=s.replace(old3,new3,1)

s=s.replace('''  loadFactories()
  load()''','''  loadCustomerAddresses(name)
  loadFactories()
  load()''',1)
s=s.replace('''function clearCustomer() {
  selectedCustomer.value = ''
  customerQuery.value = \'\'''','''function clearCustomer() {
  selectedCustomer.value = ''
  customerQuery.value = \'\'
  customerAddresses.value = []''',1)

# router 引入？检查
if "useRouter" not in s.split("from 'vue-router'")[0][-200:]:
    s=s.replace("import { showToast, showConfirmDialog } from 'vant'","import { showToast, showConfirmDialog } from 'vant'\nimport { useRouter } from 'vue-router'",1)
    s=s.replace("const selectedCustomer = ref('')","const router = useRouter()\nconst selectedCustomer = ref('')",1)

# CSS
css='''
/* 收货地址条 */
.addr-strip { display: flex; align-items: center; gap: 8px; padding: 6px 16px; background: #fbfcfe; border-bottom: 1px solid #eef0f3; font-size: 12px; color: #344054; }
.as-label { color: #98a2b3; flex: none; }
.as-item { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; background: #f2f7ff; border: 1px solid #d6e4ff; border-radius: 12px; padding: 2px 10px; }
.as-item:hover { border-color: #1677ff; }
.as-more { color: #1677ff; cursor: pointer; flex: none; }
.as-empty { color: #98a2b3; flex: 1; }
.as-manage { margin-left: auto; flex: none; border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.addr-panel { padding: 16px; }
.addr-panel h4 { margin: 0 0 10px; font-size: 15px; }
.addr-panel h4 small { color: #98a2b3; font-size: 11px; font-weight: normal; }
.ap-row { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px dashed #eef0f3; }
.ap-main { flex: 1; min-width: 0; }
.ap-name { font-size: 13px; color: #1f2937; }
.ap-default { margin-left: 6px; background: #e6f4ff; color: #1677ff; border-radius: 8px; padding: 0 6px; font-size: 10px; }
.ap-addr { font-size: 12px; color: #475467; margin-top: 3px; }
.ap-contact { font-size: 11px; color: #98a2b3; margin-top: 2px; }
.ap-copy { align-self: center; border: 1px solid #d0d5dd; background: #fff; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ui ok")
