p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()

# 表单加交期（工厂后）
old='''              <div class="form-field">
                <label>工厂</label>
                <SuggestField plain input-class="f-input" v-model="form.factory" :options="matOpts.factory"
                  placeholder="工厂（可联想）" />
              </div>'''
new='''              <div class="form-field">
                <label>工厂</label>
                <SuggestField plain input-class="f-input" v-model="form.factory" :options="matOpts.factory"
                  placeholder="工厂（可联想）" />
              </div>
              <div class="form-field">
                <label>交期</label>
                <SuggestField plain input-class="f-input" v-model="form.lead_time" :options="matOpts.lead_time"
                  placeholder="交期（可联想）" />
              </div>'''
assert old in s
s=s.replace(old,new,1)

# openForm 映射
s=s.replace("      factory: item.factory || '',\n      status: item.status || '报价',","      factory: item.factory || '',\n      lead_time: item.lead_time || '',\n      status: item.status || '报价',",1)
s=s.replace("factory: '', status: '报价', customer_desc: ''","factory: '', lead_time: '', status: '报价', customer_desc: ''",1)

# matOpts 增加 lead_time
s=s.replace("    factory: vals('factory'),","    factory: vals('factory'),\n    lead_time: vals('lead_time'),",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("client ok")
