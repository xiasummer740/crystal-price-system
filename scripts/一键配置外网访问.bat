@echo off
chcp 65001 >nul
title 晶振系统 - 外网访问一键配置

REM ===========================================================
REM  晶振报价管理系统 - 外网访问一键配置向导
REM
REM  使用方法：双击运行（会自动请求管理员权限）
REM
REM  自动完成：
REM    1. 下载 cloudflared.exe（如果还没有）
REM    2. 弹窗引导用户去 Cloudflare 复制 Tunnel Token
REM    3. 弹窗让用户粘贴 token
REM    4. 把 cloudflared 安装为开机自启服务
REM    5. 设置晶振系统开机自启
REM ===========================================================

REM 自动提权（如果不是管理员，自动用管理员重新运行）
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
    exit /b
)

cls
echo.
echo  ============================================================
echo
echo            晶振系统 - 外网访问一键配置向导
echo
echo  ============================================================
echo.
echo   本工具会自动完成 4 件事：
echo.
echo     1. 下载 cloudflared.exe（约 50MB）
echo     2. 引导你复制 Cloudflare Tunnel Token
echo     3. 把 cloudflared 安装为 Windows 服务（开机自启）
echo     4. 设置晶振系统开机自动启动
echo.
echo   全程只需粘贴一次 token，其余全自动。
echo.
echo  ------------------------------------------------------------
echo   按任意键开始，或按 Ctrl+C 取消...
pause >nul

REM ===== 步骤 1：下载 cloudflared =====
set "CF_DIR=D:\software\cloudflared"
set "CF=%CF_DIR%\cloudflared.exe"

echo.
echo [步骤 1/4] 检查 cloudflared.exe...
if exist "%CF%" (
    echo   已存在：%CF%
) else (
    echo   未找到，正在下载...
    if not exist "%CF_DIR%" mkdir "%CF_DIR%" 2>nul
    powershell -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CF%' -UseBasicParsing; Write-Host '  下载完成' -ForegroundColor Green } catch { Write-Host ('  下载失败：' + $_.Exception.Message) -ForegroundColor Red; exit 1 }"
    if not exist "%CF%" (
        echo.
        echo   [错误] 下载失败，请检查网络后重试
        echo.
        pause
        exit /b 1
    )
)

REM ===== 步骤 2：引导拿 token =====
echo.
echo [步骤 2/4] 复制 Tunnel Token
echo.
echo   接下来浏览器会自动打开 Cloudflare 后台。
echo   你需要做的：
echo.
echo     1. 登录后点：左侧 Networks（网络）
echo     2. 点：Tunnels（隧道）
echo     3. 点：crystal-tunnel
echo     4. 点：右上 Configure（配置）
echo     5. 顶部切到：Install connector（安装连接器）
echo     6. 选：Windows + 64-bit
echo     7. 复制 eyJh... 那一大串（约 200 字符）
echo.
echo   复制好后回到这个窗口，按任意键继续...
pause >nul
start "" "https://one.dash.cloudflare.com/"

REM ===== 步骤 3：弹输入框收 token =====
echo.
echo [步骤 3/4] 粘贴 Token（弹出输入框）...
echo.

for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; $t = [Microsoft.VisualBasic.Interaction]::InputBox('请粘贴 Cloudflare Tunnel Token（eyJh 开头的那一大串）：', '晶振系统 - 输入 Token', ''); Write-Output $t"`) do set "TOKEN=%%T"

if "%TOKEN%"=="" (
    echo   [取消] 没有输入 token，已退出
    pause
    exit /b 1
)

REM ===== 步骤 4a：装服务 =====
echo.
echo [步骤 4/4] 安装 Cloudflare Tunnel 服务...
"%CF%" service uninstall >nul 2>&1
"%CF%" service install %TOKEN% >nul 2>&1
if %errorlevel% neq 0 (
    echo   [错误] 服务安装失败，token 可能不正确
    pause
    exit /b 1
)
echo   ✓ Cloudflare Tunnel 服务已安装

REM ===== 步骤 4b：设置晶振系统开机自启 =====
set "EXE=%LOCALAPPDATA%\Programs\晶振报价管理系统\晶振报价管理系统.exe"
if exist "%EXE%" (
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "CrystalPriceSystem" /t REG_SZ /d "\"%EXE%\"" /f >nul 2>&1
    echo   ✓ 晶振系统已设置开机自启
) else (
    echo   [警告] 找不到晶振系统，跳过开机自启设置
    echo            预期路径：%EXE%
)

REM ===== 完成 =====
echo.
echo  ============================================================
echo
echo                    ✓ 全部配置完成！
echo
echo  ============================================================
echo.
echo   已完成：
echo     ✓ cloudflared 服务已安装（开机自动启动）
echo     ✓ 晶振系统已设置开机自动启动
echo.
echo   现在用手机打开你的隧道域名（比如）：
echo     https://sjk-crystal.你的域名
echo.
echo   如果手机访问报错 502，是因为晶振系统没运行
echo   解决：双击桌面快捷方式启动一下晶振系统即可
echo.
echo  ------------------------------------------------------------
echo.
pause
