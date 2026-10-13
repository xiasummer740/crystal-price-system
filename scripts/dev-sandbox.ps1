<#
================================================================
 晶振系统 - 开发沙箱启动器（本机接力开发专用）

 作用：把程序/后端强制指向**沙箱数据目录**，绝不碰生产数据。

 ⚠️ 生产数据目录（本机，祥哥正在用）：
      D:\software\晶振报价管理系统
    这个脚本永远不会读写它。

 用法：
   .\scripts\dev-sandbox.ps1 server            # 只起后端（改后端/调试 API，不弹 Electron）
   .\scripts\dev-sandbox.ps1 app               # 起完整 Electron 桌面端（走沙箱）
   .\scripts\dev-sandbox.ps1 server -Port 3267
   .\scripts\dev-sandbox.ps1 app -DataDir "D:\some\sandbox"

 原理：DATA_DIR 是本项目**唯一**的沙箱开关（见 electron/main.js:resolveDataDir）。
       显式传了 DATA_DIR，它的优先级高于用户配置，且会自动开启
       setEphemeralConfig(true)，因此**不会写** %APPDATA% 里的真实 user-config.json。
================================================================
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet('server', 'app')]
    [string]$Mode,

    # 留空则由脚本体算出默认沙箱：<仓库上一级>\dev-data
    # （$PSCommandPath 在 param 默认值里取不到，所以放到下面赋值）
    [string]$DataDir = '',

    [int]$Port = 3267
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $RepoRoot

# 生产数据目录 —— 只用于「拒绝启动」的护栏，绝不写入
$ProdDataDir = 'D:\software\晶振报价管理系统'

# 没显式传 -DataDir 就用默认沙箱：<仓库上一级>\dev-data
if ([string]::IsNullOrWhiteSpace($DataDir)) {
    $DataDir = Join-Path (Split-Path -Parent $RepoRoot) 'dev-data'
}

$DataDir = [System.IO.Path]::GetFullPath($DataDir)

# ===== 护栏 1：沙箱目录不能等于生产目录 =====
if ($DataDir.TrimEnd('\') -eq $ProdDataDir.TrimEnd('\')) {
    Write-Host ''
    Write-Host '  [拒绝启动] 沙箱目录被指到了生产数据目录！' -ForegroundColor Red
    Write-Host "  生产目录: $ProdDataDir" -ForegroundColor Red
    Write-Host '  这会把测试数据写进祥哥正在用的正式数据里。' -ForegroundColor Red
    Write-Host ''
    exit 1
}

# ===== 护栏 2：沙箱目录不能在生产目录里面（或反之） =====
$prodSlash = $ProdDataDir.TrimEnd('\') + '\'
$sandSlash = $DataDir.TrimEnd('\') + '\'
if ($sandSlash.StartsWith($prodSlash, 'OrdinalIgnoreCase') -or $prodSlash.StartsWith($sandSlash, 'OrdinalIgnoreCase')) {
    Write-Host ''
    Write-Host '  [拒绝启动] 沙箱目录和生产数据目录互相嵌套。' -ForegroundColor Red
    Write-Host "  沙箱 : $DataDir" -ForegroundColor Red
    Write-Host "  生产 : $ProdDataDir" -ForegroundColor Red
    Write-Host ''
    exit 1
}

# ===== 护栏 3：沙箱目录必须存在（防手滑写错路径，程序会自动建目录） =====
if (-not (Test-Path -LiteralPath $DataDir)) {
    Write-Host ''
    Write-Host "  [拒绝启动] 沙箱目录不存在: $DataDir" -ForegroundColor Red
    Write-Host '  请先建好沙箱目录（含「数据库」子目录），或用 -DataDir 指定。' -ForegroundColor Red
    Write-Host ''
    exit 1
}

# 沙箱库自检：应该有一份可丢弃的副本，不是空的
$SandDb = Join-Path $DataDir '数据库\data.db'
if (Test-Path -LiteralPath $SandDb) {
    $dbInfo = Get-Item -LiteralPath $SandDb
    $dbMd5 = (Get-FileHash -LiteralPath $SandDb -Algorithm MD5).Hash
} else {
    $dbInfo = $null
    $dbMd5 = '(不存在，程序会新建空库)'
}

Write-Host ''
Write-Host ' ============================================================' -ForegroundColor Cyan
Write-Host '  晶振系统 - 开发沙箱' -ForegroundColor Green
Write-Host ' ============================================================' -ForegroundColor Cyan
Write-Host "  模式        : $Mode"
Write-Host "  DATA_DIR    : $DataDir" -ForegroundColor Yellow
Write-Host "  沙箱库 md5  : $dbMd5"
if ($dbInfo) { Write-Host "  沙箱库最后写: $($dbInfo.LastWriteTime)" }
Write-Host "  生产目录    : $ProdDataDir  （本脚本不碰）" -ForegroundColor DarkGray
Write-Host ''

# ===== 关键：清掉这两个会捣乱的环境变量 =====
# ELECTRON_RUN_AS_NODE=1 会让 electron.exe 退化成纯 Node 执行器（不弹窗口），
# 在 agent/DSH 终端里常被注入；接力开发手动开终端时一般没有，但清掉更稳。
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
# 别让子进程继承到「跳过 electron 二进制下载」之类的开关
Remove-Item Env:\ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue

$env:DATA_DIR = $DataDir

if ($Mode -eq 'server') {
    $env:PORT = "$Port"
    Write-Host "  正在启动后端（http://localhost:$Port）..." -ForegroundColor Green
    Write-Host "  手机端可用局域网 IP + 端口访问（仅沙箱数据）" -ForegroundColor DarkGray
    Write-Host '  按 Ctrl+C 停止。' -ForegroundColor DarkGray
    Write-Host ''
    & node server\src\index.js
    exit $LASTEXITCODE
}

# Mode = app ：完整 Electron
Write-Host '  正在启动 Electron 桌面端（走沙箱）...' -ForegroundColor Green
Write-Host '  ⚠️ 启动后第一件事：看日志里的 "Window bounds:" —— 确认是沙箱再往下做。' -ForegroundColor Yellow
Write-Host ''
& node_modules\electron\dist\electron.exe .
exit $LASTEXITCODE
