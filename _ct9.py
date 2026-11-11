p="client/src/views/CompanyDocs.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''        <CompanyDocFolders v-if="ownerName" owner-type="customer" :owner-name="ownerName" :can-copy="canCopyFile" @changed="loadSummary" />''','''        <div v-if="ownerName" class="doc-title-filter">
          <span class="dtf-label">抬头</span>
          <span class="dtf-chip" :class="{ active: docTitleFilter === null }" @click="docTitleFilter = null">全部</span>
          <span class="dtf-chip" :class="{ active: docTitleFilter === '' }" @click="docTitleFilter = ''">公共资料</span>
          <span v-for="t in docTitles" :key="t.id" class="dtf-chip" :class="{ active: docTitleFilter === t.title }"
            @click="docTitleFilter = t.title">{{ t.title }}</span>
        </div>
        <CompanyDocFolders v-if="ownerName" owner-type="customer" :owner-name="ownerName" :billing-title="docTitleFilter" :can-copy="canCopyFile" @changed="loadSummary" />''',1)

s=s.replace('''async function selectCustomer(name) {
  ownerName.value = name
  await loadDocs()
}''','''const docTitles = ref([])
const docTitleFilter = ref(null)
async function loadDocTitles(name) {
  docTitles.value = []
  docTitleFilter.value = null
  if (!name) return
  try {
    const r = await fetchCustomerTitles(name)
    docTitles.value = r.data || []
  } catch {}
}
async function selectCustomer(name) {
  ownerName.value = name
  await loadDocTitles(name)
  await loadDocs()
}''',1)

s=s.replace("  fetchMapCustomers, saveCompanyProfile","  fetchCustomerTitles, fetchMapCustomers, saveCompanyProfile",1)

css='''
.doc-title-filter { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; font-size: 12px; }
.dtf-label { color: #98a2b3; }
.dtf-chip { border: 1px solid #d6e4ff; background: #f2f7ff; color: #1f2937; border-radius: 12px; padding: 2px 10px; cursor: pointer; }
.dtf-chip.active { border-color: #1677ff; background: #e6f0ff; color: #0958d9; }
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
