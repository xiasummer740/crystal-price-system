p="client/src/views/CompanyDocs.vue"
s=open(p,encoding="utf-8").read()
s=s.replace("  copyCompanyDoc, openCompanyDoc\n} from '../utils/api.js'","  copyCompanyDoc, openCompanyDoc, fetchCustomerTitles\n} from '../utils/api.js'",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
