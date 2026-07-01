# 测试运行器 — 自动发现 tests/*.test.js 并传给 node --test
$testFiles = Get-ChildItem -Path "$PSScriptRoot/*.test.js" | ForEach-Object { $_.FullName }
if (-not $testFiles) {
  Write-Host "⚠️  tests/ 下未找到 *.test.js"
  exit 0
}
node --test $testFiles
exit $LASTEXITCODE
