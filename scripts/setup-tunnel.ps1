# ===========================================================
#  晶振系统 - 外网访问一键配置（PowerShell 版，无中文乱码）
# ===========================================================

$Host.UI.RawUI.WindowTitle = '晶振系统 - 外网访问一键配置'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 自动提权
$currentPrincipal = New-Object System.Security.Principal.WindowsPrincipal([System.Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "需要管理员权限，正在重新启动..." -ForegroundColor Yellow
    $batPath = Join-Path $PSScriptRoot '一键配置外网访问.bat'
    Start-Process -FilePath $batPath -Verb RunAs
    exit
}

Clear-Host
Write-Host ""
Write-Host " ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "           晶振系统 - 外网访问一键配置向导" -ForegroundColor Green
Write-Host ""
Write-Host " ============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "   本工具会自动完成 4 件事:"
Write-Host ""
Write-Host "     1. 下载 cloudflared.exe (约 50MB)"
Write-Host "     2. 引导你复制 Cloudflare Tunnel Token"
Write-Host "     3. 把 cloudflared 安装为 Windows 服务 (开机自启)"
Write-Host "     4. 设置晶振系统开机自动启动"
Write-Host ""
Write-Host "   全程只需粘贴一次 token,其余全自动。"
Write-Host ""
Write-Host " ------------------------------------------------------------"
Read-Host "   按回车开始 (按 Ctrl+C 取消)"

# ===== 步骤 1: 下载 cloudflared =====
$CF_DIR = 'D:\software\cloudflared'
$CF = Join-Path $CF_DIR 'cloudflared.exe'

Write-Host ""
Write-Host "[步骤 1/4] 检查 cloudflared.exe..." -ForegroundColor Cyan
if (Test-Path $CF) {
    Write-Host "  已存在: $CF" -ForegroundColor Green
} else {
    Write-Host "  未找到,正在下载..." -ForegroundColor Yellow
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

# ===== 步骤 2: 引导拿 token =====
Write-Host ""
Write-Host "[步骤 2/4] 复制 Tunnel Token" -ForegroundColor Cyan
Write-Host ""
Write-Host "   接下来浏览器会自动打开 Cloudflare 后台。"
Write-Host "   你需要做的:"
Write-Host ""
Write-Host "     1. 登录后点: 左侧 Networks (网络)"
Write-Host "     2. 点: Tunnels (隧道)"
Write-Host "     3. 点: crystal-tunnel"
Write-Host "     4. 点: 右上 Configure (配置)"
Write-Host "     5. 顶部切到: Install connector (安装连接器)"
Write-Host "     6. 选: Windows + 64-bit"
Write-Host "     7. 复制 eyJh... 那一大串 (约 200 字符)"
Write-Host ""
Read-Host "   复制好后回到这里,按回车继续"
Start-Process 'https://one.dash.cloudflare.com/'

# ===== 步骤 3: 弹输入框收 token =====
Write-Host ""
Write-Host "[步骤 3/4] 粘贴 Token (弹出输入框)..." -ForegroundColor Cyan
Add-Type -AssemblyName Microsoft.VisualBasic
$TOKEN = [Microsoft.VisualBasic.Interaction]::InputBox(
    '请粘贴 Cloudflare Tunnel Token (eyJh 开头的那一大串):',
    '晶振系统 - 输入 Token',
    ''
)

if ([string]::IsNullOrWhiteSpace($TOKEN)) {
    Write-Host "  [取消] 没有输入 token,已退出" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

# ===== 步骤 4a: 装服务 =====
Write-Host ""
Write-Host "[步骤 4/4] 安装 Cloudflare Tunnel 服务..." -ForegroundColor Cyan
& $CF service uninstall 2>&1 | Out-Null
$result = & $CF service install $TOKEN 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [错误] 服务安装失败,token 可能不正确" -ForegroundColor Red
    Write-Host "  详情: $result" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
Write-Host "  [OK] Cloudflare Tunnel 服务已安装" -ForegroundColor Green

# ===== 步骤 4b: 设置晶振系统开机自启 =====
$EXE = Join-Path $env:LOCALAPPDATA 'Programs\晶振报价管理系统\晶振报价管理系统.exe'
if (Test-Path $EXE) {
    $regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    Set-ItemProperty -Path $regPath -Name 'CrystalPriceSystem' -Value "`"$EXE`"" -Force
    Write-Host "  [OK] 晶振系统已设置开机自启" -ForegroundColor Green
} else {
    Write-Host "  [警告] 找不到晶振系统,跳过开机自启设置" -ForegroundColor Yellow
    Write-Host "          预期路径: $EXE" -ForegroundColor DarkGray
}

# ===== 完成 =====
Write-Host ""
Write-Host " ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "                    [OK] 全部配置完成!" -ForegroundColor Green
Write-Host ""
Write-Host " ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   已完成:"
Write-Host "     [OK] cloudflared 服务已安装 (开机自动启动)" -ForegroundColor Green
Write-Host "     [OK] 晶振系统已设置开机自动启动" -ForegroundColor Green
Write-Host ""
Write-Host "   现在用手机打开你的隧道域名 (例如):"
Write-Host "     https://sjk-crystal.你的域名" -ForegroundColor Cyan
Write-Host ""
Write-Host "   如果手机访问报错 502,是因为晶振系统没运行"
Write-Host "   解决: 双击桌面快捷方式启动一下晶振系统即可"
Write-Host ""
Write-Host " ------------------------------------------------------------"
Read-Host "按回车退出"
