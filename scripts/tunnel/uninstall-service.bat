@echo off
chcp 65001 >nul
title 卸载 Cloudflare Tunnel 服务

set "CF=D:\software\cloudflared\cloudflared.exe"

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 需要以管理员身份运行此脚本
    pause
    exit /b 1
)

if not exist "%CF%" (
    echo [错误] 没找到 cloudflared.exe：%CF%
    pause
    exit /b 1
)

echo 正在卸载 Cloudflare Tunnel 服务...
"%CF%" service uninstall

echo.
echo 完成。
pause
