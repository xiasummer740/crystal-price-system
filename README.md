# 晶振报价管理系统

晶振公司内部物料价格记录查询系统 — Electron 桌面应用。

**PC 端双击 exe 即可运行，手机在任意网络都能用域名访问。** 数据存储在本地 SQLite，无需外部数据库。

---

## 下载安装

前往 [Releases](https://github.com/xiasummer740/crystal-price-system/releases) 页面，下载最新版 `crystal-price-system-vX.X.X-setup.exe`，双击安装即可。

安装时按提示选择数据存放位置（推荐 D 盘或 E 盘），后面随时可在菜单切换。

---

## 功能特性

- 报价记录 CRUD + 分页搜索 + 多条件筛选
- Excel 批量导入 / 导出
- 自动备份（数据库保留 30 份，Excel 各保留 10 份）
- 局域网手机访问
- **外网访问**：手机在 4G / 外地 WiFi 也能用固定域名打开系统
- 数据目录自定义
- 软删除（数据不物理删除）
- PC 端顶栏实时时钟

---

## 外网访问配置

> 让手机在任何网络（4G / 公司 WiFi / 外地）都能用固定域名打开系统。全程约 10 分钟，只需操作一次。

### 原理

```
手机 (4G / 外网)
  │ https://sjk-crystal.你的域名
  ▼
Cloudflare 全球网络（自动 HTTPS）
  │ 加密隧道
  ▼
你家电脑（开机自启，无需公网 IP）
  │ localhost:3266
  ▼
晶振报价管理系统
```

### 前置准备（一次性，约 15 分钟）

需要 3 样东西，少一样都不行：

<details>
<summary><b>A. 买一个域名（约 ¥50/年，点我展开</b></summary>

去 [阿里云](https://wanwang.aliyun.com/domain)、[腾讯云](https://dnspod.cloud.tencent.com/) 或 [Namecheap](https://www.namecheap.com/) 买一个域名。

推荐用 `.top` 后缀，便宜（首年 ¥9-15），示例：`你的名字.top`

买完什么都不用配，跳到下一步。
</details>

<details>
<summary><b>B. 注册 Cloudflare + 接入域名（免费，点我展开）</b></summary>

1. 打开 https://dash.cloudflare.com/sign-up 注册（邮箱即可）
2. 登录后点 **Add a site**（添加站点）
3. 输入你买的域名（不带 www），点 Continue
4. 选 **Free** 套餐，点 Continue
5. Cloudflare 会给你两个 **NS 地址**，类似：
   ```
   anna.ns.cloudflare.com
   bob.ns.cloudflare.com
   ```
6. **去你买域名的地方**（阿里云/腾讯云），把域名的 DNS 服务器改成上面两个
   - 阿里云：控制台 → 域名列表 → 管理 → DNS 修改 → 自定义 DNS
   - 腾讯云：控制台 → 域名管理 → 更多 → DNS 修改
7. 改完后等 5-30 分钟，Cloudflare 页面刷新显示 **Active** 即可

</details>

<details>
<summary><b>C. 开通 Zero Trust + 创建 Tunnel（免费，点我展开）</b></summary>

1. 打开 https://one.dash.cloudflare.com/
2. 首次进入会提示创建 Team Name，随便填（比如 `crystal-team`），选 **Free** 套餐
3. 左侧菜单 → **Networks** → **Tunnels**
4. 点 **Create a tunnel**
5. Connector type 选 **Cloudflared**，点 Next
6. Tunnel name 填 `crystal-tunnel`（必须用这个名字），点 **Save tunnel**
7. 下一步 **不用管**（脚本会自动配置），直接关掉页面

</details>

<details>
<summary><b>D. 创建 Cloudflare API Token（免费，点我展开）</b></summary>

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 点 **创建令牌**（Create Token）→ **创建自定义令牌**
3. 令牌名称填 `crystal-tunnel-dns`
4. 权限点 **添加更多** 4 次，分别选：

| 资源类型 | 权限 |
|----------|------|
| 区域 → DNS | 编辑 |
| 区域 → DNS | 读取 |
| 帐户 → Cloudflare Tunnel | 编辑 |
| 帐户 → Cloudflare Tunnel | 读取 |

5. 区域资源选 **所有区域**，帐户资源选 **所有帐户**
6. 点 **继续以显示摘要** → **创建令牌**
7. **复制保存 Token**（只显示这一次！关了页面就看不到了）

</details>

---

### 一键配置（2 分钟）

前置准备做完后，打开你装好的晶振系统：

```
桌面快捷方式右键 → 打开文件所在位置
→ 进 resources\scripts 文件夹
→ 右键「一键配置外网访问.bat」→ 以管理员身份运行
```

脚本会按顺序问你 3 个问题：

| 提示 | 填什么 |
|------|--------|
| 你的域名 | `你的域名`（如 `taikon.top`） |
| 子域名 | 直接回车（默认 `sjk-crystal`） |
| API Token | 粘贴步骤 D 保存的 Token |
| Tunnel Token | 浏览器自动弹出 → 复制 `eyJh...` 粘贴 |

输入完自动执行 6 步：

```
[1/6] 下载 cloudflared.exe
[2/6] API 自动配置 DNS + Tunnel Public Hostname
[3/6] 打开浏览器引导复制 Tunnel Token
[4/6] 弹窗粘贴 Token
[5/6] 安装 Windows 服务 + 开机自启
[6/6] 等 10 秒 → 验证外网能否访问
```

看到 `全部配置完成` 就搞定了。

---

### 验证

手机打开 `https://sjk-crystal.你的域名`，应该直接看到晶振系统页面。

电脑关机重启后，cloudflared 和晶振系统都会自动启动，无需手动操作。

---

### 常见报错速查

| 错误 | 原因 | 解决 |
|------|------|------|
| **503** | Tunnel 没连上 / DNS 配错 | 重新跑「一键配置外网访问.bat」 |
| **502** | 晶振系统没启动 | 双击桌面图标启动晶振系统 |
| **1033** | cloudflared 服务停了 | PowerShell 管理员执行 `Restart-Service Cloudflared` |
| **无法访问此网站** | 电脑关机/断网了 | 检查部署的那台电脑是否开着 |

---

### 取消配置

- 取消 Tunnel 服务：`resources\scripts\tunnel\uninstall-service.bat`（管理员）
- 取消晶振开机自启：`resources\scripts\startup\取消开机自启.bat`

---

## 局域网访问

不需要外网的话，手机连同一 WiFi，浏览器访问 `http://<PC的IP>:3266` 即可。

---

## 技术栈

- **桌面端**: Electron 33
- **前端**: Vue 3 + Vite + Vant UI 4 + Pinia + Vue Router
- **后端**: Node.js + Express + sql.js
- **打包**: electron-builder (NSIS installer)
- **外网穿透**: Cloudflare Tunnel（免费 / 无需公网 IP）

---

## 开发

```bash
# 安装依赖
npm install
cd server && npm install
cd ../client && npm install
cd ..

# 开发模式（Electron + Vite HMR）
npm run dev

# 打包安装版
npm run package:installer
```

## 数据目录

首次安装时会提示选择数据保存位置（推荐 D 盘或 E 盘）。所有数据（数据库、规格书、模板、备份、Excel 备份）都保存在该目录下。

卸载时可选择保留或删除数据。后续可通过菜单「文件 → 切换数据目录」迁移到新位置。
