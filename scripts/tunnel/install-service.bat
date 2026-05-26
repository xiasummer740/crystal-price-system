@echo off
chcp 65001 >nul
title 安装 Cloudflare Tunnel 服务

REM ===========================================================
REM  安装 cloudflared 为 Windows 服务（开机自启 + 自动重连）
REM
REM  使用前：
REM    1. 确保 cloudflared.exe 已下载到 D:\software\cloudflared\
REM       下载地址：https://github.com/cloudflare/cloudflared/releases/latest
REM    2. 去 Cloudflare 后台拿 Tunnel Token
REM       https://one.dash.cloudflare.com/ → Zero Trust → Networks
REM       → Tunnels → crystal-tunnel → Configure → 复制 token
REM    3. 用【管理员身份】右键运行此 bat
REM ===========================================================

set "CF=D:\software\cloudflared\cloudflared.exe"

if not exist "%CF%" (
    echo.
    echo [错误] 没找到 cloudflared.exe：%CF%
    echo 请先下载到该路径，下载地址：
    echo https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    echo.
    pause
    exit /b 1
)

REM 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [错误] 需要以管理员身份运行此脚本
    echo 请右键 → 以管理员身份运行
    echo.
    pause
    exit /b 1
)

REM 卸载旧服务（如果存在）
echo.
echo 步骤 1/3：清理旧服务（如果有）...
"%CF%" service uninstall >nul 2>&1

REM 提示输入 token
echo.
echo 步骤 2/3：粘贴 Tunnel Token
echo.
echo 去 Cloudflare 后台复制 token：
echo   https://one.dash.cloudflare.com/
echo   → Zero Trust → Networks → Tunnels → crystal-tunnel
echo   → Configure → Install connector → 复制 eyJh... 那一长串
echo.
set /p TOKEN="请粘贴 token 并回车："

if "%TOKEN%"=="" (
    echo [错误] token 为空，已取消
    pause
    exit /b 1
)

REM 安装服务
echo.
echo 步骤 3/3：安装服务...
"%CF%" service install %TOKEN%

if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo   ✓ 安装成功！服务已启动并设为开机自启
    echo ============================================
    echo.
    echo 现在去 Cloudflare 后台应该能看到 connector 显示 "Healthy"
    echo 手机用 sjk-crystal.<你的域名> 应该能访问了
    echo.
    sc query Cloudflared
) else (
    echo.
    echo [错误] 安装失败，请检查 token 是否正确
)

echo.
pause
