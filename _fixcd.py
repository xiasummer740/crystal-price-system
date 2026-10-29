p="client/src/views/CompanyDocs.vue"
s=open(p,encoding="utf-8").read()
s=s.replace("""          <CompanyDocFolders owner-type="self" :owner-name="c.name" :can-copy="canCopyFile" @changed="loadSummary" />
          </div>
        </div>""","""          <CompanyDocFolders owner-type="self" :owner-name="c.name" :can-copy="canCopyFile" @changed="loadSummary" />
        </div>""")
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
