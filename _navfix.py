p="client/src/views/Dashboard.vue"
s=open(p,encoding="utf-8").read()

# 汉堡按钮加“菜单”文字
s=s.replace('''<button class="mobile-menu-btn" @click="showMobileMenu = !showMobileMenu">
          <span class="menu-bar"></span>
          <span class="menu-bar"></span>
          <span class="menu-bar"></span>
        </button>''','''<button class="mobile-menu-btn" @click="showMobileMenu = !showMobileMenu" title="菜单">
          <span class="menu-bar"></span>
          <span class="menu-bar"></span>
          <span class="menu-bar"></span>
          <span class="menu-text">菜单</span>
        </button>''',1)

# 顶栏下方加手机端横向导航条（窄窗口/浏览器里也能看到一排按钮）
old='''      <!-- 移动端下拉菜单 -->'''
new='''      <!-- 窄窗口/手机端：顶栏下方常驻一排导航（避免按钮栏“消失”） -->
      <div class="mobile-nav-strip">
        <button class="mns-btn" @click="openMaterialsWin">📦 客户物料</button>
        <button class="mns-btn" @click="openMapWin">🗺️ 地图地址</button>
        <router-link to="/order" class="mns-btn">🧾 生成订单</router-link>
        <router-link to="/company-docs" class="mns-btn">🏢 公司资料</router-link>
        <router-link to="/quotes" class="mns-btn">📋 报价单</router-link>
        <button class="mns-btn" @click="showMobileMenu = true">更多…</button>
      </div>

      <!-- 移动端下拉菜单 -->'''
assert old in s
s=s.replace(old,new,1)

# CSS
css='''
.mobile-nav-strip { display: none; }
.menu-text { font-size: 11px; color: #475467; margin-left: 2px; }
@media (max-width: 768px) {
  .mobile-nav-strip {
    display: flex; gap: 6px; overflow-x: auto; padding: 6px 10px;
    background: #f6fbf7; border-bottom: 1px solid #e3efe7; flex-shrink: 0;
    -webkit-overflow-scrolling: touch;
  }
  .mobile-nav-strip::-webkit-scrollbar { display: none; }
  .mns-btn {
    flex: 0 0 auto; border: 1px solid #d9e7dd; background: #fff; color: #2f5d45;
    border-radius: 14px; padding: 4px 10px; font-size: 12px; text-decoration: none; cursor: pointer;
  }
  .mobile-menu-btn { display: flex; flex-direction: row; align-items: center; gap: 3px; padding: 4px 8px; }
}
'''
idx=s.rfind("</style>")
s=s[:idx]+css+"\n"+s[idx:]
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
