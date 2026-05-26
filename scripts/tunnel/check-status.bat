@echo off
chcp 65001 >nul
title Cloudflare Tunnel 服务状态

echo ============================================
echo   Cloudflare Tunnel 服务状态
echo ============================================
echo.

sc query Cloudflared 2>nul
if %errorlevel% neq 0 (
    echo [未安装] Cloudflared 服务不存在
    echo 请运行 install-service.bat 安装
    echo.
    pause
    exit /b 0
)

echo.
echo ============================================
echo   最近日志（按 Ctrl+C 退出）
echo ============================================
echo.

REM 实时跟踪 cloudflared 日志（最近 50 行 + 持续监听）
powershell -Command "Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='cloudflared'} -MaxEvents 30 -ErrorAction SilentlyContinue | Sort-Object TimeCreated | Format-Table TimeCreated,LevelDisplayName,Message -AutoSize -Wrap"

echo.
pause
