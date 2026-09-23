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

# 无终端环境（CI / 被脚本调用）下 Clear-Host 会抛「句柄无效」，吞掉即可
try { Clear-Host } catch {}
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

if (-not $NewVersion) {
    $confirm = Read-Host '  确认开始发布? [y/N]'
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host '  已取消'
        exit 0
    }
} else {
    Write-Host '  [自动] 版本已指定，跳过确认' -ForegroundColor Cyan
}

# ===== [1/5] 更新版本号 =====
Write-Host ''
Write-Host '[1/5] 更新版本号...' -ForegroundColor Cyan

# ⚠️ -replace 的 pattern/replacement 必须加括号。
# 不加时 `'A' + $x + '"', 'B' + $y + '"' 会被解析成字符串拼接/数组，而非两个参数，
# 替换静默失效：写回原内容，却仍然打印 [OK]。
# 实测（2026-09-23）：v1.0.214 因此被打包成 1.0.213.exe。
$content = Get-Content $PackageJsonPath -Raw -Encoding UTF8
$content = $content -replace ('"version":\s*"' + [regex]::Escape($CurrentVersion) + '"'), ('"version": "' + $NewVersion + '"')
[System.IO.File]::WriteAllText($PackageJsonPath, $content, (New-Object System.Text.UTF8Encoding $false))

# 写回后核对，杜绝静默失败（宁可在这里停下，也别打出一个版本号错的包）
$verifyVersion = (Get-Content $PackageJsonPath -Raw | ConvertFrom-Json).version
if ($verifyVersion -ne $NewVersion) {
    Write-Host "  [错误] 版本号写入失败：期望 $NewVersion，实际 $verifyVersion" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] package.json: $CurrentVersion -> $NewVersion（已核对）" -ForegroundColor Green

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
    $content = $content -replace ('"version":\s*"' + [regex]::Escape($NewVersion) + '"'), ('"version": "' + $CurrentVersion + '"')
    [System.IO.File]::WriteAllText($PackageJsonPath, $content, (New-Object System.Text.UTF8Encoding $false))
    Write-Host '  [提示] 版本号已回滚' -ForegroundColor Yellow
    exit 1
}
Write-Host "  [OK] 构建完成 ($([math]::Round($sw.Elapsed.TotalSeconds, 1))s)" -ForegroundColor Green

# ===== [3/5] 准备上传文件 =====
Write-Host ''
Write-Host '[3/5] 准备上传文件...' -ForegroundColor Cyan

# 自动检测打包产物（artifactName: crystal-price-system-setup-{version}.exe）
$DefaultInstallerPattern = "crystal-price-system-setup-$NewVersion.exe"
$InstallerPath = Join-Path $DistDir $DefaultInstallerPattern

# 生成英文名副本（GitHub 上传用）
$InstallerNameEN = "crystal-price-system-setup-$NewVersion.exe"
$InstallerENPath = Join-Path $DistDir $InstallerNameEN

$hasInstaller = Test-Path $InstallerPath

if ($hasInstaller) {
    # nsis.artifactName 已是英文名时，$InstallerPath 与 $InstallerENPath 是同一个路径，
    # Copy-Item 会「无法用自身覆盖自身」并因 $ErrorActionPreference='Stop' 直接终止
    if ($InstallerPath -ne $InstallerENPath) {
        Copy-Item $InstallerPath $InstallerENPath -Force
    } else {
        Write-Host '  [提示] 产物名已是英文，跳过复制副本' -ForegroundColor Cyan
    }
    $sizeMB = [math]::Round((Get-Item $InstallerPath).Length / 1MB, 1)
    Write-Host "  安装版: $DefaultInstallerPattern ($sizeMB MB)" -ForegroundColor Green
} else {
    Write-Host '  [错误] 没有找到打包产物！' -ForegroundColor Red
    Write-Host "  期待文件: $InstallerPath" -ForegroundColor Yellow
    # 回滚版本号，别把仓库留在「已 bump 但没发版」的半路状态
    $content = Get-Content $PackageJsonPath -Raw -Encoding UTF8
    $content = $content -replace ('"version":\s*"' + [regex]::Escape($NewVersion) + '"'), ('"version": "' + $CurrentVersion + '"')
    [System.IO.File]::WriteAllText($PackageJsonPath, $content, (New-Object System.Text.UTF8Encoding $false))
    Write-Host '  [提示] 版本号已回滚' -ForegroundColor Yellow
    exit 1
}

# 修正 latest.yml：把中文文件名改为英文，匹配实际上传的文件名
$LatestYmlPath = Join-Path $DistDir 'latest.yml'
if (Test-Path $LatestYmlPath) {
    $ymlContent = Get-Content $LatestYmlPath -Raw -Encoding UTF8
    $ymlContent = $ymlContent -replace '晶振报价管理系统 Setup [\d\.]+\.exe', $InstallerNameEN
    [System.IO.File]::WriteAllText($LatestYmlPath, $ymlContent, (New-Object System.Text.UTF8Encoding $true))
    Write-Host "  [OK] latest.yml 已修正为英文文件名" -ForegroundColor Green
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
    make_latest = "true"
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

# 上传 latest.yml（自动更新元数据）
$LatestYmlPath = Join-Path $DistDir 'latest.yml'
if (Test-Path $LatestYmlPath) {
    Write-Host '  上传 latest.yml...'
    try {
        $uploadHeaders = $baseHeaders.Clone()
        $uploadHeaders['Content-Type'] = 'application/octet-stream'
        $uploadUrlFull = "$uploadUrl`?name=latest.yml"
        Invoke-RestMethod -Uri $uploadUrlFull -Method Post -Headers $uploadHeaders -InFile $LatestYmlPath
        Write-Host "  [OK] latest.yml 已上传" -ForegroundColor Green
    } catch {
        Write-Host "  [警告] latest.yml 上传失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [警告] latest.yml 不存在，跳过" -ForegroundColor Yellow
}

# 上传 blockmap（差分更新）
$BlockMapPath = Join-Path $DistDir "$InstallerNameEN.blockmap"
if (Test-Path $BlockMapPath) {
    Write-Host '  上传 blockmap...'
    try {
        $uploadHeaders = $baseHeaders.Clone()
        $uploadHeaders['Content-Type'] = 'application/octet-stream'
        $uploadUrlFull = "$uploadUrl`?name=$InstallerNameEN.blockmap"
        Invoke-RestMethod -Uri $uploadUrlFull -Method Post -Headers $uploadHeaders -InFile $BlockMapPath
        Write-Host "  [OK] blockmap 已上传" -ForegroundColor Green
    } catch {
        Write-Host "  [警告] blockmap 上传失败: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ===== 清理临时文件 =====
Write-Host ''
Write-Host '清理临时文件...' -ForegroundColor Gray
# 两者同路径时，删 EN 副本等于删掉刚打好的产物，必须跳过
if ($InstallerPath -ne $InstallerENPath -and (Test-Path $InstallerENPath)) { Remove-Item $InstallerENPath -Force }
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
