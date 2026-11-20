import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { fileURLToPath } from 'url'
import * as A from './customerArchive.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.join(__dirname, '..', '..', 'templates', 'rebate-template.doc')

function psQuote(s) {
  return String(s ?? '').replace(/'/g, "''")
}

/**
 * 用祥哥原来的 .doc 模板生成备案表：只替换客户名/部门/业务/日期/明细行/银行信息，
 * 版式、字体、列宽、页面设置都沿用模板，不重新排版。
 */
export function buildRebateDocx(data) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(TEMPLATE)) return reject(new Error('找不到备案表模板: ' + TEMPLATE))
    const customer = String(data.customer || '').trim()
    const dir = A.ensureDir(path.join(A.customerDirAbs(customer), '佣金'))
    const d0 = new Date()
    const stamp = data.date || `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`
    const base = `${customer}-回扣备案-${stamp}`.replace(/[\\/:*?"<>|]/g, '_')
    const docxPath = path.join(dir, base + '.docx')
    const pdfPath = path.join(dir, base + '.pdf')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crystal-rebate-'))
    const jsonPath = path.join(tmpDir, 'data.json')
    const tmpDoc = path.join(tmpDir, 'template.doc')
    fs.copyFileSync(TEMPLATE, tmpDoc)
    fs.writeFileSync(jsonPath, JSON.stringify({ ...data, date: stamp }, null, 2), 'utf8')

    const ps = `
$ErrorActionPreference = 'Stop'
$data = Get-Content -Raw -Encoding UTF8 '${psQuote(jsonPath)}' | ConvertFrom-Json
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Open('${psQuote(tmpDoc)}', $false, $false)

function Replace-All($doc, $old, $new) {
  if ([string]::IsNullOrEmpty($old)) { return }
  $f = $doc.Content.Find
  $f.ClearFormatting()
  $f.Replacement.ClearFormatting()
  [void]$f.Execute($old, $false, $false, $false, $false, $false, $true, 1, $false, $new, 2)
}

$oldCustomer = '深圳索瑞德电子有限公司'
Replace-All $doc $oldCustomer $data.customer
Replace-All $doc '张建庭' $data.account_name
Replace-All $doc '6230 3518 8891 2769' $data.account_no
Replace-All $doc '深圳农商银行' $data.bank_name

# 第 2 段：部门 / 业务 / 日期
$p2 = $doc.Paragraphs.Item(2)
$p2.Range.Text = '部门：' + $data.department + '                          业务：' + $data.business + '                  日期：' + $data.date

$table = $doc.Tables.Item(1)
$rows = @($data.rows)
if ($rows.Count -eq 0) { $rows = @([pscustomobject]@{ name=''; taxable=$true; quote=''; order_price=''; method=''; remark='' }) }

# 找到「银行信息」行，数据行是 3 .. bankStart-1
$bankStart = 0
for ($r = 1; $r -le $table.Rows.Count; $r++) {
  $txt = [string]$table.Cell($r,1).Range.Text
  if ($txt.StartsWith('银行信息')) { $bankStart = $r; break }
}
if ($bankStart -eq 0) { $bankStart = $table.Rows.Count + 1 }

# 模板数据行是 3 .. bankStart-1；先按实际条数填，多余的删掉
$available = $bankStart - 3
$useCount = $rows.Count
if ($useCount -gt $available) {
  # 超出模板行数时，在银行信息行前补行（复制当前最后一行的格式）
  for ($i = $available; $i -lt $useCount; $i++) {
    [void]$table.Rows.Add($table.Rows.Item($bankStart).Range)
    $bankStart++
  }
}

function Set-Row($table, $index, $row) {
  $vals = @([string]$row.name, $(if ($row.taxable -eq $false) {'否'} else {'是'}), [string]$row.quote, [string]$row.order_price, [string]$row.method, [string]$row.remark)
  for ($c = 1; $c -le 6; $c++) {
    $cell = $table.Cell($index, $c)
    $cell.Range.Text = $vals[$c-1]
    $cell.Range.Font.Name = '宋体'
    $cell.Range.Font.Size = 9
    $cell.Range.ParagraphFormat.Alignment = $(if ($c -eq 1) {0} else {1})
  }
}

for ($i = 0; $i -lt $useCount; $i++) {
  Set-Row $table (3 + $i) $rows[$i]
}
# 删除模板里没用到数据行（从下往上删，避免索引变化）
for ($r = $bankStart - 1; $r -ge (3 + $useCount); $r--) {
  $table.Rows.Item($r).Delete()
}

$doc.SaveAs2('${psQuote(docxPath)}', 16)
$doc.ExportAsFixedFormat('${psQuote(pdfPath)}', 17)
$doc.Close($false)
$word.Quit()
Write-Output 'OK'
`
    const psPath = path.join(tmpDir, 'make.ps1')
    fs.writeFileSync(psPath, '\ufeff' + ps, 'utf8')

    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath], { timeout: 120000, windowsHide: true }, (err, stdout, stderr) => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
      if (err) {
        reject(new Error('生成备案表失败: ' + (stderr || err.message).slice(0, 400)))
        return
      }
      if (!fs.existsSync(docxPath)) {
        reject(new Error('生成备案表失败：没有输出文件'))
        return
      }
      resolve({ docxPath, pdfPath: fs.existsSync(pdfPath) ? pdfPath : '', date: stamp })
    })
  })
}
