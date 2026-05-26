@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File ".\setup-tunnel.ps1"
if %errorlevel% neq 0 pause
