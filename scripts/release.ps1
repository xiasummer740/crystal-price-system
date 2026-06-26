# ============================================================
#  晶振系统 - 一键发布脚本
#  用法: .\scripts\release.ps1 [版本号]
#  或通过 npm: npm run release [-- 版本号]
# ============================================================

param(
    [string]$NewVersion
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = '晶振系统 - 一键发布'

# 仓库根目录 = 脚本目录的父级
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $RepoRoot

$RepoOwner = 'xiasummer740'
$RepoName  = 'crystal-price-system'
$DistDir   = Join-Path $RepoRoot 'dist-exe'

Clear-Host
Write-Host ''
Write-Host ' ============================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  ' -NoNewline
Write-Host '晶振系统 - 一键发布' -ForegroundColor Green
Write-Host ''
Write-Host ' ============================================================' -ForegroundColor Cyan
Write-Host ''

# ===== 读取当前版本 =====
$PackageJsonPath = Join-Path $RepoRoot 'package.json'
$PackageJson = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json
$CurrentVersion = $PackageJson.version

# 确定新版本号
if (-not $NewVersion) {
    $NewVersion = Read-Host "  当前版本 v$CurrentVersion，请输入新版本号"
}
while ($NewVersion -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host '  [错误] 版本号格式不正确，必须是 x.y.z 格式' -ForegroundColor Red
    $NewVersion = Read-Host '  请重新输入'
}
if ($NewVersion -eq $CurrentVersion) {
    Write-Host "  [错误] 新版本号 ($NewVersion) 和当前版本号相同" -ForegroundColor Red
    exit 1
}

# ===== 确认信息 =====
Write-Host ''
Write-Host ' ┌──────────────────────────────────────────┐'
Write-Host " │  发布版本: v$CurrentVersion -> v$NewVersion"
Write-Host " │  仓库:     $RepoOwner/$RepoName"
$PortableNameCN = "晶振报价管理系统-便携版-v$NewVersion.exe"
$InstallerNameCN = "晶振报价管理系统-安装版-v$NewVersion.exe"
Write-Host " │  便携版:   $PortableNameCN"
Write-Host " │  安装版:   $InstallerNameCN"
Write-Host ' └──────────────────────────────────────────┘'
Write-Host ''

$confirm = Read-Host '  确认开始发布? [y/N]'
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host '  已取消'
    exit 0
}

# ===== [1/5] 更新版本号 =====
Write-Host ''
Write-Host '[1/5] 更新版本号...' -ForegroundColor Cyan

$content = Get-Content $PackageJsonPath -Raw -Encoding UTF8
$content = $content -replace '"version":\s*"' + $CurrentVersion + '"', '"version": "' + $NewVersion + '"'
[System.IO.File]::WriteAllText($PackageJsonPath, $content, (New-Object System.Text.UTF8Encoding $true))
Write-Host "  [OK] package.json: $CurrentVersion -> $NewVersion" -ForegroundColor Green

# ===== [2/5] 构建 + 打包 =====
Write-Host ''
Write-Host '[2/5] 构建前端 + 打包 exe (约 2-4 分钟)...' -ForegroundColor Cyan
Write-Host '  正在运行 npm run package...'

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$buildResult = & npm run package 2>&1
$sw.Stop()

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [错误] 构建失败！($($sw.Elapsed.TotalSeconds)s)" -ForegroundColor Red
    Write-Host "  $buildResult"
    # 回滚版本号
    $content = Get-Content $PackageJsonPath -Raw -Encoding UTF8
    $content = $content -replace '"version":\s*"' + $NewVersion + '"', '"version": "' + $CurrentVersion + '"'
    [System.IO.File]::WriteAllText($PackageJsonPath, $content, (New-Object System.Text.UTF8Encoding $true))
    Write-Host '  [提示] 版本号已回滚' -ForegroundColor Yellow
    exit 1
}
Write-Host "  [OK] 构建完成 ($([math]::Round($sw.Elapsed.TotalSeconds, 1))s)" -ForegroundColor Green

# ===== [3/5] 准备上传文件 =====
Write-Host ''
Write-Host '[3/5] 准备上传文件...' -ForegroundColor Cyan

$PortablePath = Join-Path $DistDir $PortableNameCN
$InstallerPath = Join-Path $DistDir $InstallerNameCN

# 生成英文名副本（GitHub API 上传更稳定）
$PortableNameEN = "crystal-price-system-portable-v$NewVersion.exe"
$InstallerNameEN = "crystal-price-system-setup-v$NewVersion.exe"
$PortableENPath = Join-Path $DistDir $PortableNameEN
$InstallerENPath = Join-Path $DistDir $InstallerNameEN

$hasPortable = Test-Path $PortablePath
$hasInstaller = Test-Path $InstallerPath

if ($hasPortable) {
    Copy-Item $PortablePath $PortableENPath -Force
    $sizeMB = [math]::Round((Get-Item $PortablePath).Length / 1MB, 1)
    Write-Host "  便携版: $PortableNameCN ($sizeMB MB)" -ForegroundColor Green
}
if ($hasInstaller) {
    Copy-Item $InstallerPath $InstallerENPath -Force
    $sizeMB = [math]::Round((Get-Item $InstallerPath).Length / 1MB, 1)
    Write-Host "  安装版: $InstallerNameCN ($sizeMB MB)" -ForegroundColor Green
}

if (-not $hasPortable -and -not $hasInstaller) {
    Write-Host '  [错误] 没有找到打包产物！' -ForegroundColor Red
    exit 1
}

# ===== [4/5] 提交代码 + 推送标签 =====
Write-Host ''
Write-Host '[4/5] 提交代码 + 推送标签...' -ForegroundColor Cyan

$tagName = "v$NewVersion"

# 检查是否有未提交变更
$changed = & git status --porcelain 2>$null
if ($changed) {
    & git add package.json
    & git commit -m "chore: release v$NewVersion"
    Write-Host "  [OK] 已提交版本号变更" -ForegroundColor Green
} else {
    Write-Host "  [提示] 没有需要提交的变更" -ForegroundColor Yellow
}

# 检查标签是否已存在
$existingTag = & git tag -l $tagName 2>$null
if ($existingTag) {
    Write-Host "  [警告] 标签 $tagName 已存在，删除旧标签..." -ForegroundColor Yellow
    & git tag -d $tagName
    & git push origin --delete $tagName 2>$null
    Write-Host "  [OK] 旧标签已删除" -ForegroundColor Green
}

& git tag -a $tagName -m "Release v$NewVersion"
Write-Host "  [OK] 标签 $tagName 已创建" -ForegroundColor Green

& git push origin HEAD
Write-Host "  已推送代码" -ForegroundColor Green
& git push origin $tagName
Write-Host "  已推送标签" -ForegroundColor Green
Write-Host "  [OK] 推送到远端完成" -ForegroundColor Green

# ===== [5/5] GitHub Release =====
Write-Host ''
Write-Host '[5/5] 创建 GitHub Release + 上传安装包...' -ForegroundColor Cyan

# 获取 GitHub Token
$credInput = "protocol=https`nhost=github.com`n"
$credOutput = $credInput | git credential fill 2>&1
$token = ($credOutput | Select-String 'password=(.+)' | ForEach-Object { $_.Matches.Groups[1].Value })

if (-not $token) {
    Write-Host '  [错误] 无法获取 GitHub Token' -ForegroundColor Red
    Write-Host "  请手动上传 dist-exe\ 中的 exe 文件" -ForegroundColor Yellow
    Write-Host "  https://github.com/$RepoOwner/$RepoName/releases/new" -ForegroundColor Yellow
    exit 1
}

$baseHeaders = @{
    Authorization = "Bearer $token"
    Accept        = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}

# 检查是否已有该 tag 的 Release（如果有则删除重建）
Write-Host '  检查已有 Release...'
$existingRelease = $null
try {
    $existingRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases/tags/$tagName" -Headers $baseHeaders -ErrorAction SilentlyContinue
    if ($existingRelease) {
        # 删除旧 Release 的 assets
        foreach ($asset in $existingRelease.assets) {
            Invoke-RestMethod -Uri $asset.url -Method Delete -Headers $baseHeaders | Out-Null
            Write-Host "    已删旧资产: $($asset.name)"
        }
        # 删除旧 Release
        Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases/$($existingRelease.id)" -Method Delete -Headers $baseHeaders | Out-Null
        Write-Host '  [OK] 旧 Release 已删除' -ForegroundColor Green
    }
} catch {
    # Release 不存在，正常流程
}

# 构建发布说明
$releaseBody = @"
晶振报价管理系统 v$NewVersion

---

### 安装

- **安装版**：下载 `crystal-price-system-setup-v$NewVersion.exe`，双击安装
- **便携版**：下载 `crystal-price-system-portable-v$NewVersion.exe`，双击直接运行

### 外网访问

安装后运行 `一键配置外网访问.bat`，按提示输入域名 + Token 即可。
详细教程：[README](https://github.com/$RepoOwner/$RepoName#外网访问配置)
"@

$releaseBodyJson = @{
    tag_name    = $tagName
    name        = "v$NewVersion"
    body        = $releaseBody
    draft       = $false
    prerelease  = $false
} | ConvertTo-Json

Write-Host '  创建 GitHub Release...'
try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$RepoOwner/$RepoName/releases" -Method Post -Headers $baseHeaders -Body $releaseBodyJson -ContentType 'application/json'
    Write-Host "  [OK] Release 已创建: $($release.html_url)" -ForegroundColor Green
} catch {
    $errBody = ''
    try { $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); $errBody = $reader.ReadToEnd(); $reader.Close() } catch {}
    Write-Host "  [错误] 创建 Release 失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  $errBody" -ForegroundColor Red
    exit 1
}

# 上传 assets
$uploadUrl = $release.upload_url -replace '\{\?name,label\}', ''

if ($hasPortable) {
    Write-Host '  上传便携版...'
    try {
        $uploadHeaders = $baseHeaders.Clone()
        $uploadHeaders['Content-Type'] = 'application/octet-stream'
        $uploadUrlFull = "$uploadUrl`?name=" + [System.Web.HttpUtility]::UrlEncode($PortableNameEN)
        Invoke-RestMethod -Uri $uploadUrlFull -Method Post -Headers $uploadHeaders -InFile $PortableENPath
        Write-Host "  [OK] 便携版已上传" -ForegroundColor Green
    } catch {
        Write-Host "  [警告] 便携版上传失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

if ($hasInstaller) {
    Write-Host '  上传安装版...'
    try {
        $uploadHeaders = $baseHeaders.Clone()
        $uploadHeaders['Content-Type'] = 'application/octet-stream'
        $uploadUrlFull = "$uploadUrl`?name=" + [System.Web.HttpUtility]::UrlEncode($InstallerNameEN)
        Invoke-RestMethod -Uri $uploadUrlFull -Method Post -Headers $uploadHeaders -InFile $InstallerENPath
        Write-Host "  [OK] 安装版已上传" -ForegroundColor Green
    } catch {
        Write-Host "  [警告] 安装版上传失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ===== 清理临时文件 =====
Write-Host ''
Write-Host '清理临时文件...' -ForegroundColor Gray
if (Test-Path $PortableENPath) { Remove-Item $PortableENPath -Force }
if (Test-Path $InstallerENPath) { Remove-Item $InstallerENPath -Force }
Write-Host '  [OK] 完成' -ForegroundColor Gray

# ===== 全部完成 =====
Write-Host ''
Write-Host ' ============================================================' -ForegroundColor Green
Write-Host ''
Write-Host "   [OK] v$NewVersion 发布完成!" -ForegroundColor Green
Write-Host ''
Write-Host "   Release 地址:" -ForegroundColor Cyan
Write-Host "   https://github.com/$RepoOwner/$RepoName/releases/tag/v$NewVersion" -ForegroundColor Cyan
Write-Host ''
Write-Host ' ============================================================' -ForegroundColor Green
Write-Host ''
