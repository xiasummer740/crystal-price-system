@echo off
chcp 65001 >nul
title 设置晶振系统开机自启

REM ===========================================================
REM  双击运行即可，不需要管理员权限
REM  原理：写入 HKCU\Run 注册表项（用户登录时自动启动）
REM ===========================================================

set "EXE=%LOCALAPPDATA%\Programs\晶振报价管理系统\晶振报价管理系统.exe"

if not exist "%EXE%" (
    echo.
    echo [错误] 找不到晶振系统：
    echo %EXE%
    echo.
    echo 请先安装晶振报价管理系统，再运行此脚本。
    echo.
    pause
    exit /b 1
)

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "CrystalPriceSystem" /t REG_SZ /d "\"%EXE%\"" /f >nul

if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo   ✓ 完成！晶振系统会开机自动启动
    echo ============================================
    echo.
    echo 下次开机不用再手动双击桌面图标。
    echo 想取消的话，双击运行 取消开机自启.bat
    echo.
) else (
    echo [错误] 设置失败，请重试或联系管理员
)

pause
