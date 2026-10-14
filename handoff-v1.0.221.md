# 接力文档 v1.0.221

> 承接 `handoff-v1.0.220.md`。本版是**在公司电脑（两地接力）上第一次走完发版全流程**，
> 干了三件事：① 把「发版」这条路彻底打通（打包环境 + 发版脚本两个拦路虎）
> ② 启动动画重做（透明 logo / 严格居中 / 出现在软件窗口位置 / 慢启动自解释）
> ③ 修掉沿路量出来的真缺陷。旧 tag: v1.0.220 · 本次 tag: v1.0.221

## 一句话

**v1.0.221 已发版**，三样资产齐全、在线更新实测能发现并下完；
启动动画那句「卡住」现在会自己说清楚在等什么；打包/发版脚本的两个坑已修并入库。

---

## 一、发版链路修复：这台机器上第一次成功发版

上一版停在「打包环境」，本版把它和后面两个坑一起清了。**三个坑都不是代码问题，但都会让发版静默失败。**

### 1. 打包卡点：`winCodeSign-2.6.0` 解压要建 macOS 符号链接

- **复现**：electron-builder 把下载+解压委托给 Go 版 `app-builder.exe`，它**无条件**下
  `winCodeSign`（版本 **2.6.0**，URL 实测
  `.../electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z`），
  解压带 `-snl` ⇒ 包内 2 个 macOS 软链（`darwin/10.12/lib/{libcrypto,libssl}.dylib`）建不出来
  ⇒ `exit status 2` ⇒ 整包中止。本机**未开**开发者模式、进程**非管理员**
  （实测 `New-Item -ItemType SymbolicLink` 报「此操作需要管理员权限」）。
- **不签名也照下**：`sign:false` / `forceCodeSigning:false` 都拦不住（本机已验证）。
- **解法（已落地，换机器照抄）**：把该包**排除 darwin** 解压到打包器**真正认的目录**
  `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`
  （判据：`app-builder.exe download-artifact --name winCodeSign` 直接打印该路径、**exit 0 且不再下载**；
  随机数字目录是失败残留，不认）。
  ```powershell
  $repo="<repo>"; $cache="$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
  $seven="$repo\node_modules\7zip-bin\win\x64\7za.exe"
  $arc=Get-ChildItem $cache -Filter *.7z | Select-Object -First 1   # 5,635,384 B, md5=06EA32242279AD33BABA1870CAA084D8
  & $seven x -bd "-x!darwin" $arc.FullName "-o$cache\winCodeSign-2.6.0"   # 解压后 58 个文件、无 darwin
  ```
  解压后应有 `rcedit-x64.exe`、`windows-10\{x64,ia32}\signtool.exe`，**没有 darwin**。
- **更干净的路（未做，可选）**：开 Windows「开发者模式」后不必预置缓存。本机 `admin` 在
  Administrators 组里（只是进程没提权），管理员 PowerShell：
  `reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /f /v AllowDevelopmentWithoutDevLicense /d 1`

> ⚠️ 每次打包都会**覆盖仓库里已跟踪的两个生成文件**（线上资产元数据 / 自动生成类型），
> 打完包记得还原：`git checkout -- dist-exe/latest.yml client/components.d.ts`
> （发版那次例外——`latest.yml` 就该更新成新版本，见文末）。

### 2. 发版脚本：`[System.Web.HttpUtility]` 在干净会话里解析不了 ⇒ **安装包静默不上传**

- 实测（`powershell -NoProfile`）：`Unable to find type [System.Web.HttpUtility]`——`System.Web` 不是默认加载的。
- 而这句包在 `try/catch` 里，失败只打一句警告 ⇒ **Release 建好了、点最新版却没有安装包**，
  在线更新直接废掉。v1.0.220 能传上去，是因为 `npm run release` 会加载 profile、
  会话里恰好有 `System.Web` —— **那是运气不是设计**。
- 已改用 `[uri]::EscapeDataString(...)`（`System` 命名空间，任何会话都在；纯 ASCII 文件名结果一致）。

### 3. 发版脚本：**没有 UTF-8 BOM**，PowerShell 5.1 按 GBK 读 ⇒ 一行都跑不了

- `scripts/release.ps1` 在工作区是**无 BOM 的 UTF-8**，而 `npm run release` 用的是
  Windows PowerShell 5.1，它读无 BOM 的 `.ps1` 会按 ANSI(GBK) 解 —— 中文全乱、报一串假语法错。
- 项目里 `dev-sandbox.ps1` / `setup-tunnel.ps1` 都有 BOM，**只有它漏了**（在另一台机器上写的）。
- 已补 `EF BB BF`；冒烟测试 `powershell -NoProfile -File .\scripts\release.ps1 1.0.220`
  ⇒ 正常打印中文并报「新版本号和当前相同」退出 1（证明能解析、且不误触发流程）。

> 📌 结论：**这台机器的发版链路现在是通的**，`npm run release -- 1.0.222` 可直接用。
> 唯一前置是 GitHub 凭据：`gh` 已装（winget），token 在 Windows 凭据管理器里，
> 脚本靠 `gh auth token` 取（本次实测可用，无需重新登录）。

---

## 二、启动动画重做（祥哥两条反馈）

### 反馈 1：「logo 是白色方块，而且不在窗口正中间」

| 项 | 改前 | 改后 |
|---|---|---|
| logo 图 | `SJK-256.png`（256×256，alpha **全 255** = 不透明白方块） | `SJK.png`（**815×254 真透明字标**，本来就在 `client/public` 下没人用） |
| 渲染 | 96×96 方块 + 圆角 | 宽 224px、圆角 0、按字标比例 |
| 位置（窗口内） | 流式布局 ⇒ 被下方 141px 内容顶到**偏上 50px**（实测 logo 中心 y=120 / 窗口中心 y=170） | 绝对定位钉在 `50%/50%` ⇒ **偏差 0.0px** |
| 版式 | logo 在上、标题在下 | **标题在上**、logo 居中、进度条与提示在下（否则下方内容更重，logo 必然被顶上去） |
| 窗口位置 | `center:true` ⇒ 永远钉在**屏幕正中** | 出现在**主界面窗口将要出现的位置**（复用 `createWindow` 同一套坐标判据） |

窗口位置那条的距离感：主窗口记忆位置 `109,113 1400x900`（中心 809,563），屏幕正中是 750,350
——**垂直差 213px**。用户把软件拖到别处/副屏时，闪屏却跳到屏幕中间，很割裂。
现在实测**闪屏中心 809,563 == 主窗口中心 809,563，偏差 0.0px**。

### 反馈 2：「偶尔启动卡在动画上」

**先查了生产 `startup.log` 全部 196 次启动**（不是猜）：

| 统计 | 值 |
|---|---|
| 常态启动总耗时 | 4 ~ 20 秒 |
| 超过 30 秒的 | **17 次** |
| 最慢一次 | **164.4 秒**（2026-10-14 00:49:58 那次，主进程被堵近 18 秒、页面 164 秒才出来） |
| 从未等到页面加载 | 2 次（9/4、9/27，多半被强杀） |

**根因性质**：不是死锁，是**慢**——本机装了**三个杀软**（火绒 + 腾讯电脑管家 + Windows Defender），
每层都挂钩子，Electron 冷启动要起 6+ 个子进程、读 190MB exe + asar，被反复扫描。
系统代理（127.0.0.1:10808）**不是**原因（`ProxyOverride` 里有 `localhost;127.*`，本地请求不走代理）。

**代码侧能做的（已做）**：

1. **闪屏自己会说清楚**：提示行加一条**跑在渲染进程**的计时（主进程被堵住它照样在走）——
   `<6s`「正在启动…」· `6~30s`「启动较慢（已 N 秒）…请稍候」·
   `≥30s`「启动较慢（已 N 秒），通常在等安全软件扫描，不是死机。…把「数据目录 / logs / startup.log」发给技术。」
2. **兜底提前**：原来那道 90 秒兜底要等主窗口建好才武装，而 `startServer()`（同步 import + 同步跑
   `syncArchive`）卡住时它**压根没被注册** ⇒ 闪屏永远没人关。现在从闪屏出现就开始计时
   （`earlyFallback`），服务就绪后 `clearTimeout` 让位给原兜底。
3. **日志补耗时**：`Page loaded successfully（启动总耗时 Nms）` —— 下次一眼看出慢在哪。

> 说清楚边界：**这三个都不能让杀软不扫**，慢的根子还在环境上（建议只留一个杀软、
> 把软件目录加白名单）。代码侧保证的是「不再一动不动地干等、且能拿到日志」。

### 顺路量出来的两个真缺陷（都已修）

| 缺陷 | 实测偏差 | 修法 |
|---|---|---|
| 入场动画 `fadeIn` 带 `translateY(10px)` | 那 0.8 秒里整卡下沉、**logo 偏下 10.00px** | 改为只淡入、**不位移** |
| 窗口比卡片（324×276）矮时内容溢出出滚动条 | 内容被挤偏 **8.50px** | `html,body{overflow:hidden}` 居中裁切 |

---

## 三、验证证据（全部真 Electron，`DATA_DIR=沙箱`）

| 验证器 | 覆盖 | 结果 |
|---|---|---|
| `tests/manual/verify-splash-cdp.mjs` | 真机闪屏：logo 图/尺寸、**窗口内居中 ≤1px**、**闪屏中心 == 主窗口中心 ≤2px**（判据取自启动日志，不手填） | **12/12** |
| `tests/manual/verify-splash-centering.mjs` | 9 种窗口尺寸（420×340 / 520×420 / 360×300 / 800×600 / 1200×800 / 480×260 / 340×460 / 324×276 / 300×220）× 居中 | **27/27**，偏差全 **0.00px** |
| `tests/manual/verify-splash-slowstart.mjs` | 慢启动三档文案（**从 main.js 抽出厂 HTML 真跑**，不是重打副本） | **7/7** |
| `tests/manual/verify-update-check-cdp.mjs` | 用装着的 **1.0.220** 起沙箱，检查更新 → 发现新版本 → 下载完成 | **4/4** |
| `tests/splash-position.test.js` | 闪屏坐标纯函数（含副屏负坐标、首次启动、坐标被丢弃、无显示器信息） | **7/7** |
| 后端全量 | `npm run test:backend` | **97 pass / 0 fail**（原 90 + 新增 7） |
| 前端 | `npm run test:frontend` | **3 pass** |

**在线更新实测（最硬的一条）**：日志原文
`Download block maps (old: …/v1.0.220/…blockmap, new: …/v1.0.221/…blockmap)` →
`Full: 116,439.7 KB, To download: 75,098.76 KB (64%)` → 差量下载 →
`New version 1.0.221 has been downloaded to …\pending\crystal-price-system-setup-1.0.221.exe`
（**119,234,250 B，与线上资产逐字节一致**）；页面真实文本实测
「新版本 v1.0.221 已下载完成 ⚡ 立即重启安装 也可以不管它 —— 下次关闭软件时会自动装好」，
工具栏小红点 `dot=true`。

**打包产物实跑**（发版前必做，没只靠 `npm start`）：`dist-exe/win-unpacked` 里的真 exe
带 `DATA_DIR=沙箱` 起，URL 带 `packaged=true`、闪屏 12/12、`/api/prices` → `code=0`。

**生产零污染**（每轮跑完都核）：`data.db` md5 `370934119739D404733EFE9E6CDA662A`、
文件数 **1102**，与基线一致；真实配置 `dataDir` 仍指 `D:\software\晶振报价管理系统`、
`data-dir.txt` 未被动。

---

## 四、发版结果（2026-10-14）

https://github.com/xiasummer740/crystal-price-system/releases/tag/v1.0.221

| 项 | 值 |
|---|---|
| tag → 提交 | `v1.0.221` → `92aa066`（含本次全部修复） |
| 线上状态 | 非草稿、非预发布、**Latest** |
| 安装包 | `crystal-price-system-setup-1.0.221.exe` · **119,234,250 B** |
| blockmap | `…exe.blockmap` · 121,216 B（🔴 必传，差量更新靠它） |
| latest.yml | 378 B；`sha512` / `size` 与实传资产**逐字节一致**（本地复算校验通过） |

---

## 五、遗留 / 下次注意

- ⚠️ **仓库里有一个多余的 Draft release**（`1.0.221` / `1.0.220` 各一个，0 资产）：
  是 electron-builder 读到 `package.json` 的 `publish` 配置后自动建的草稿。只对仓库所有者可见，
  不影响在线更新（updater 读 `/releases/latest`，不看草稿）。要清理请**按 release id 删**，
  别用 `gh release delete 1.0.221`（同 tag 会命中正式那条）。
- ⚠️ **三个杀软**是「偶尔启动很慢」的根子：火绒 + 腾讯电脑管家 + Windows Defender。
  建议只留一个，并把 `D:\software\crystal-price-system` 与数据目录加白名单。
- 📌 **生产数据备份**留在 `D:\dsh-workspace\晶振报价软件\生产数据备份-2026-10-14`（317 目录 / 1102 文件 /
  340.63 MB，`data.db` md5 与源一致）。确认新版没问题后可自行删除。
- 📌 **生产库基线指纹已更新**（`dev-data\生产库基线指纹.txt`）：md5 从 `9F76631C…` 变为
  `3709341197…`、文件数 1101 → 1102。原因是 10/13 那次误写生产（写了 2 条测试记录又删除，
  SQLite 页未回收 ⇒ md5 变）+ 应用自己生成的 `客户资料归档报告.txt`。**不是新事故**。
- 📌 本机 `npm run release` 现在能一把梭；若换机器，记得先补 winCodeSign 缓存（见第一节）
  和 `gh auth login`。
- 📌 「路径长度余量」等 v1.0.220 的遗留判断仍然有效，见 `handoff-v1.0.220.md` 末节。
