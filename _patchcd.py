p = r"client/src/views/CompanyDocs.vue"
s = open(p, encoding="utf-8").read()

# 客户 tab 主区
start = s.index('      <section class="cd-main">')
end = s.index('    <!-- ===== 自己公司 ===== -->')
new_customer = '''      <section class="cd-main">
        <div class="main-head">
          <span class="main-title">{{ ownerName || '请选择客户' }}</span>
        </div>
        <p class="main-tip">
          按类目建文件夹（默认名「当天日期-自定义」，例如 20261029-ISO9001）；文件支持 <b>拖入 / Ctrl+V 粘贴 / 点击选择</b>，
          证照和体系证书可以单独设过期时间。
        </p>
        <CompanyDocFolders v-if="ownerName" owner-type="customer" :owner-name="ownerName" :can-copy="canCopyFile" @changed="loadSummary" />
        <div v-else class="main-empty">请先在左边选择客户</div>
      </section>
    </div>

'''
s = s[:start] + new_customer + s[end:]

# 自己公司：文件夹组件替换旧的分类下拉 + 文档网格
old_self = s[s.index('          <div class="comp-docs">'):s.index('          </div>\n        </div>\n      </section>\n    </div>\n  </div>\n</template>')]
new_self = '''          <div class="comp-docs">
            <button class="mini-up" @click="copyCompanyInfo(c)">📋 复制开票资料</button>
          </div>
          <CompanyDocFolders owner-type="self" :owner-name="c.name" :can-copy="canCopyFile" @changed="loadSummary" />
'''
s = s.replace(old_self, new_self)

# 引入组件
s = s.replace("import { showConfirmDialog, showNotify, showSuccessToast } from 'vant'",
              "import { showConfirmDialog, showNotify, showSuccessToast } from 'vant'\nimport CompanyDocFolders from '../components/CompanyDocFolders.vue'")

open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
