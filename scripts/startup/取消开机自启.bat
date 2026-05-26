@echo off
chcp 65001 >nul
title 取消晶振系统开机自启

reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "CrystalPriceSystem" /f >nul 2>&1

if %errorlevel% equ 0 (
    echo.
    echo ✓ 已取消晶振系统开机自启
    echo.
) else (
    echo.
    echo 没有找到开机自启配置（可能本来就没设置）
    echo.
)

pause
