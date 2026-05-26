# ===========================================================
#  晶振系统 - 外网访问一键配置（含 Cloudflare API 自动配 DNS）
#  PowerShell 版 | UTF-8 BOM | PowerShell 5/7 兼容
# ===========================================================

$Host.UI.RawUI.WindowTitle = '晶振系统 - 外网访问一键配置'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 自动提权
$currentPrincipal = New-Object System.Security.Principal.WindowsPrincipal([System.Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $batPath = Join-Path $PSScriptRoot '一键配置外网访问.bat'
    if (Test-Path $batPath) {
        Start-Process -FilePath $batPath -Verb RunAs
    } else {
        Write-Host "请以管理员身份重新运行此脚本" -ForegroundColor Red
    }
    exit
}

Clear-Host
Write-Host ""
Write-Host " ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  " -NoNewline
Write-Host "晶振系统 - 外网访问一键配置向导" -ForegroundColor Green
Write-Host ""
Write-Host " ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  本工具自动完成 6 件事:" -ForegroundColor White
Write-Host ""
Write-Host "    1. 检查/下载 cloudflared.exe (~50MB)" -ForegroundColor Gray
Write-Host "    2. 用 Cloudflare API 自动配置 DNS 解析" -ForegroundColor Gray
Write-Host "    3. 引导复制 Tunnel Token" -ForegroundColor Gray
Write-Host "    4. 把 cloudflared 安装为 Windows 服务 (开机自启)" -ForegroundColor Gray
Write-Host "    5. 设置晶振系统开机自动启动" -ForegroundColor Gray
Write-Host "    6. 验证外网能否正常访问" -ForegroundColor Gray
Write-Host ""
Write-Host "  需要提前准备:" -ForegroundColor Yellow
Write-Host "    - Cloudflare API Token (有 DNS 和 Tunnel 权限)" -ForegroundColor Yellow
Write-Host "    - Cloudflare Tunnel Token (eyJh... 开头)" -ForegroundColor Yellow
Write-Host "    - 你的域名已接入 Cloudflare" -ForegroundColor Yellow
Write-Host ""
Write-Host " ------------------------------------------------------------"
Read-Host "  按回车开始 (按 Ctrl+C 取消)"

# ===== 收集信息 =====
Write-Host ""
Write-Host "[信息收集] 填写域名和 API Token" -ForegroundColor Cyan
Write-Host ""

# 域名
$DOMAIN = Read-Host "  你的域名 (例如 taikon.top)"
while ([string]::IsNullOrWhiteSpace($DOMAIN)) {
    $DOMAIN = Read-Host "  域名不能为空，请重新输入"
}

# 子域名
$DEFAULT_SUB = 'sjk-crystal'
$SUBDOMAIN = Read-Host "  子域名 [默认: $DEFAULT_SUB]"
if ([string]::IsNullOrWhiteSpace($SUBDOMAIN)) { $SUBDOMAIN = $DEFAULT_SUB }

$FULL_DOMAIN = "$SUBDOMAIN.$DOMAIN"

# Cloudflare API Token
Write-Host ""
Write-Host "  Cloudflare API Token 获取方法:" -ForegroundColor DarkGray
Write-Host "    1. 打开 https://dash.cloudflare.com/profile/api-tokens" -ForegroundColor DarkGray
Write-Host "    2. 点 'Create Token' -> 'Create Custom Token'" -ForegroundColor DarkGray
Write-Host "    3. Permissions 加 4 条:" -ForegroundColor DarkGray
Write-Host "       Zone:DNS:Edit, Zone:DNS:Read" -ForegroundColor DarkGray
Write-Host "       Account:Cloudflare Tunnel:Edit, Account:Cloudflare Tunnel:Read" -ForegroundColor DarkGray
Write-Host "    4. Zone Resources: All zones (或指定域名)" -ForegroundColor DarkGray
Write-Host "    5. 复制生成的 Token" -ForegroundColor DarkGray
Write-Host ""
$CF_API_TOKEN = Read-Host "  Cloudflare API Token (粘贴后不会显示)"
while ([string]::IsNullOrWhiteSpace($CF_API_TOKEN)) {
    $CF_API_TOKEN = Read-Host "  API Token 不能为空，请重新输入"
}

Write-Host "  配置信息:" -ForegroundColor Green
Write-Host "    域名: $FULL_DOMAIN" -ForegroundColor Green
Write-Host "    API Token: $($CF_API_TOKEN.Substring(0,[Math]::Min(12,$CF_API_TOKEN.Length)))..." -ForegroundColor Green

# ===== 步骤 1: 下载 cloudflared =====
$CF_DIR = 'D:\software\cloudflared'
$CF = Join-Path $CF_DIR 'cloudflared.exe'

Write-Host ""
Write-Host "[步骤 1/6] 检查 cloudflared.exe..." -ForegroundColor Cyan
if (Test-Path $CF) {
    Write-Host "  已存在: $CF" -ForegroundColor Green
} else {
    Write-Host "  未找到, 正在下载..." -ForegroundColor Yellow
    if (-not (Test-Path $CF_DIR)) { New-Item -ItemType Directory -Path $CF_DIR -Force | Out-Null }
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $CF -UseBasicParsing
        Write-Host "  下载完成" -ForegroundColor Green
    } catch {
        Write-Host "  [错误] 下载失败: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "按回车退出"
        exit 1
    }
}

# ===== 步骤 2: Cloudflare API 自动配置 DNS =====
Write-Host ""
Write-Host "[步骤 2/6] Cloudflare API 自动配置 DNS..." -ForegroundColor Cyan

$API_BASE = 'https://api.cloudflare.com/client/v4'
$API_HEADERS = @{
    'Authorization' = "Bearer $CF_API_TOKEN"
    'Content-Type'  = 'application/json'
}

# 验证 API Token
Write-Host "  验证 API Token..."
$VERIFY = Invoke-RestMethod -Uri "$API_BASE/user/tokens/verify" -Headers $API_HEADERS -Method Get -ErrorAction SilentlyContinue
if (-not $VERIFY -or $VERIFY.result.status -ne 'active') {
    Write-Host "  [错误] API Token 无效或已过期" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
Write-Host "  API Token 有效" -ForegroundColor Green

# 获取 Zone ID
Write-Host "  查询域名 Zone ID..."
$ZONES = Invoke-RestMethod -Uri "$API_BASE/zones?name=$DOMAIN" -Headers $API_HEADERS -Method Get
if (-not $ZONES.success -or $ZONES.result.Count -eq 0) {
    Write-Host "  [错误] 找不到域名 $DOMAIN，请确认已在 Cloudflare 接入" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
$ZONE_ID = $ZONES.result[0].id
Write-Host "  Zone ID: $ZONE_ID" -ForegroundColor Green

# 获取 Account ID（从 Zone 信息直接拿，不需要额外 API 权限）
Write-Host "  查询账户 ID..."
$ZONE_DETAIL = Invoke-RestMethod -Uri "$API_BASE/zones/$ZONE_ID" -Headers $API_HEADERS -Method Get
$ACCOUNT_ID = $ZONE_DETAIL.result.account.id
$ACCOUNT_NAME = $ZONE_DETAIL.result.account.name
Write-Host "  账户: $ACCOUNT_NAME ($ACCOUNT_ID)" -ForegroundColor Green

# 获取 Tunnel 列表，找 crystal-tunnel
Write-Host "  查询 Tunnel 信息..."
$TUNNELS = Invoke-RestMethod -Uri "$API_BASE/accounts/$ACCOUNT_ID/cfd_tunnel" -Headers $API_HEADERS -Method Get
$TUNNEL = $TUNNELS.result | Where-Object { $_.name -eq 'crystal-tunnel' } | Select-Object -First 1

if (-not $TUNNEL) {
    Write-Host "  [警告] 找不到名为 crystal-tunnel 的隧道" -ForegroundColor Yellow
    Write-Host "  将跳过 DNS 自动配置，请手动在 Cloudflare 后台配置 Public Hostname" -ForegroundColor Yellow
} else {
    Write-Host "  找到 Tunnel: $($TUNNEL.name) ($($TUNNEL.id))" -ForegroundColor Green

    # 获取 Tunnel 的 CNAME 目标
    $TUNNEL_DETAIL = Invoke-RestMethod -Uri "$API_BASE/accounts/$ACCOUNT_ID/cfd_tunnel/$($TUNNEL.id)" -Headers $API_HEADERS -Method Get
    $TUNNEL_CNAME = $TUNNEL_DETAIL.result.cname
    if (-not $TUNNEL_CNAME) {
        # 拼接: <tunnel-id>.cfargotunnel.com
        $TUNNEL_CNAME = "$($TUNNEL.id).cfargotunnel.com"
    }
    Write-Host "  Tunnel CNAME: $TUNNEL_CNAME" -ForegroundColor Green

    # 删除旧的 DNS 记录（如果有，避免冲突）
    Write-Host "  清理旧 DNS 记录..."
    $OLD_RECORDS = Invoke-RestMethod -Uri "$API_BASE/zones/$ZONE_ID/dns_records?type=CNAME&name=$FULL_DOMAIN" -Headers $API_HEADERS -Method Get
    foreach ($rec in $OLD_RECORDS.result) {
        Invoke-RestMethod -Uri "$API_BASE/zones/$ZONE_ID/dns_records/$($rec.id)" -Headers $API_HEADERS -Method Delete | Out-Null
        Write-Host "    已删: $($rec.name) -> $($rec.content)"
    }
    # 也清理可能的 A 记录
    $OLD_A = Invoke-RestMethod -Uri "$API_BASE/zones/$ZONE_ID/dns_records?type=A&name=$FULL_DOMAIN" -Headers $API_HEADERS -Method Get
    foreach ($rec in $OLD_A.result) {
        Invoke-RestMethod -Uri "$API_BASE/zones/$ZONE_ID/dns_records/$($rec.id)" -Headers $API_HEADERS -Method Delete | Out-Null
        Write-Host "    已删: $($rec.name) -> $($rec.content)"
    }

    # 创建 CNAME 记录（橙色云朵 = proxied）
    Write-Host "  创建 CNAME 记录..."
    $DNS_PAYLOAD = @{
        type    = 'CNAME'
        name    = $SUBDOMAIN
        content = $TUNNEL_CNAME
        ttl     = 1
        proxied = $true
    } | ConvertTo-Json

    $DNS_RESULT = Invoke-RestMethod -Uri "$API_BASE/zones/$ZONE_ID/dns_records" -Headers $API_HEADERS -Method Post -Body $DNS_PAYLOAD
    if ($DNS_RESULT.success) {
        Write-Host "  [OK] DNS 记录已创建: $FULL_DOMAIN -> $TUNNEL_CNAME" -ForegroundColor Green

        # 同时配置 Tunnel Public Hostname（确保路由正确）
        Write-Host "  配置 Tunnel Public Hostname..."
        $TUNNEL_CONFIG = Invoke-RestMethod -Uri "$API_BASE/accounts/$ACCOUNT_ID/cfd_tunnel/$($TUNNEL.id)/configurations" -Headers $API_HEADERS -Method Get
        $config = $TUNNEL_CONFIG.result.config
        if (-not $config) { $config = @{} }
        if (-not $config.ingress) { $config.ingress = @() }

        # 检查是否已有该 hostname
        $existingIngress = $config.ingress | Where-Object { $_.hostname -eq $FULL_DOMAIN }
        if (-not $existingIngress) {
            # 添加新的 ingress 规则（在 catch-all 之前）
            $newIngress = @{
                hostname = $FULL_DOMAIN
                service  = "http://localhost:3266"
            }
            # 在 catch-all 之前插入
            $catchAllIndex = -1
            for ($i = 0; $i -lt $config.ingress.Count; $i++) {
                if ($config.ingress[$i].service -eq 'http_status:404') {
                    $catchAllIndex = $i
                    break
                }
            }
            if ($catchAllIndex -ge 0) {
                $newList = @()
                for ($i = 0; $i -lt $config.ingress.Count; $i++) {
                    if ($i -eq $catchAllIndex) { $newList += $newIngress }
                    $newList += $config.ingress[$i]
                }
                if ($catchAllIndex -eq -1) { $newList += $newIngress }
                $config.ingress = $newList
            } else {
                $config.ingress = @($newIngress) + $config.ingress
            }

            $PUT_PAYLOAD = @{ config = $config } | ConvertTo-Json -Depth 10
            $PUT_RESULT = Invoke-RestMethod -Uri "$API_BASE/accounts/$ACCOUNT_ID/cfd_tunnel/$($TUNNEL.id)/configurations" -Headers $API_HEADERS -Method Put -Body $PUT_PAYLOAD
            if ($PUT_RESULT.success) {
                Write-Host "  [OK] Tunnel Public Hostname 已配置" -ForegroundColor Green
            } else {
                Write-Host "  [警告] Tunnel 配置同步失败，请手动在后台检查" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  Public Hostname 已存在，跳过" -ForegroundColor Green
        }
    } else {
        Write-Host "  [错误] DNS 创建失败: $($DNS_RESULT.errors[0].message)" -ForegroundColor Red
        Write-Host "  请手动在 Cloudflare 后台 DNS 页添加 CNAME 记录:" -ForegroundColor Yellow
        Write-Host "    $FULL_DOMAIN CNAME $TUNNEL_CNAME (橙色云朵)" -ForegroundColor Yellow
    }
}

# ===== 步骤 3: 引导拿 tunnel token =====
Write-Host ""
Write-Host "[步骤 3/6] 复制 Tunnel Token" -ForegroundColor Cyan
Write-Host ""
Write-Host "  接下来浏览器会自动打开 Cloudflare 后台。"
Write-Host "  你需要做的:"
Write-Host ""
Write-Host "    1. 登录后点: Networks -> Tunnels"
Write-Host "    2. 点: crystal-tunnel -> Configure"
Write-Host "    3. 切到: Install connector"
Write-Host "    4. 选: Windows + 64-bit"
Write-Host "    5. 复制 eyJh... 那一大串 (约 200 字符)"
Write-Host ""
Read-Host "  复制好后回到这里,按回车继续"
Start-Process 'https://one.dash.cloudflare.com/'

# ===== 步骤 4: 弹输入框收 token =====
Write-Host ""
Write-Host "[步骤 4/6] 粘贴 Token (弹出输入框)..." -ForegroundColor Cyan
Add-Type -AssemblyName Microsoft.VisualBasic
$TUNNEL_TOKEN = [Microsoft.VisualBasic.Interaction]::InputBox(
    '请粘贴 Cloudflare Tunnel Token (eyJh 开头的那一大串):',
    '晶振系统 - 输入 Tunnel Token',
    ''
)

if ([string]::IsNullOrWhiteSpace($TUNNEL_TOKEN)) {
    Write-Host "  [取消] 没有输入 token, 已退出" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

# ===== 步骤 5: 装 cloudflared 服务 + 开机自启 =====
Write-Host ""
Write-Host "[步骤 5/6] 安装 Cloudflare Tunnel 服务..." -ForegroundColor Cyan
& $CF service uninstall 2>&1 | Out-Null
$result = & $CF service install $TUNNEL_TOKEN 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [错误] 服务安装失败, token 可能不正确" -ForegroundColor Red
    Write-Host "  详情: $result" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
Write-Host "  [OK] Cloudflare Tunnel 服务已安装" -ForegroundColor Green

# 设置晶振系统开机自启
$EXE = Join-Path $env:LOCALAPPDATA 'Programs\晶振报价管理系统\晶振报价管理系统.exe'
if (Test-Path $EXE) {
    $regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    Set-ItemProperty -Path $regPath -Name 'CrystalPriceSystem' -Value "`"$EXE`"" -Force
    Write-Host "  [OK] 晶振系统已设置开机自启" -ForegroundColor Green
} else {
    Write-Host "  [警告] 找不到晶振系统, 跳过开机自启" -ForegroundColor Yellow
}

# ===== 步骤 6: 验证 =====
Write-Host ""
Write-Host "[步骤 6/6] 等待 10 秒让 DNS 生效 + Tunnel 连接..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

Write-Host "  正在验证 https://$FULL_DOMAIN ..." -ForegroundColor Cyan
try {
    $VERIFY_RESULT = Invoke-WebRequest -Uri "https://$FULL_DOMAIN" -UseBasicParsing -TimeoutSec 15 -ErrorAction SilentlyContinue
    if ($VERIFY_RESULT -and $VERIFY_RESULT.StatusCode -eq 200) {
        Write-Host "  [OK] 外网访问正常!" -ForegroundColor Green
        Write-Host "  手机打开 https://$FULL_DOMAIN 即可使用" -ForegroundColor Green
    } else {
        Write-Host "  [警告] 响应码: $($VERIFY_RESULT.StatusCode)" -ForegroundColor Yellow
        Write-Host "  请等 1 分钟后刷新试试" -ForegroundColor Yellow
        Write-Host "  DNS 完全生效可能需要 1-5 分钟" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [提示] 暂时连不上, DNS 可能在生效中" -ForegroundColor Yellow
    Write-Host "  请过 1-2 分钟用手机试试: https://$FULL_DOMAIN" -ForegroundColor Yellow
}

# ===== 完成 =====
Write-Host ""
Write-Host " ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   [OK]  全部配置完成!" -ForegroundColor Green
Write-Host ""
Write-Host " ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  已完成:" -ForegroundColor White
Write-Host "    [OK] cloudflared 服务已安装 (开机自启)" -ForegroundColor Green
Write-Host "    [OK] 晶振系统已设置开机自启" -ForegroundColor Green
Write-Host "    [OK] DNS 已自动配置" -ForegroundColor Green
Write-Host "    [OK] Tunnel Public Hostname 已配置" -ForegroundColor Green
Write-Host ""
Write-Host "  手机访问地址:" -ForegroundColor Cyan
Write-Host "    https://$FULL_DOMAIN" -ForegroundColor Cyan
Write-Host ""
Write-Host " ------------------------------------------------------------"
Read-Host "  按回车退出"
