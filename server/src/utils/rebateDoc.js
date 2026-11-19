import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import * as A from './customerArchive.js'

function psQuote(s) {
  return String(s ?? '').replace(/'/g, "''")
}

/**
 * 生成「回扣备案表」Word + PDF。
 * 用 Word COM 新建文档，按祥哥模板的版式写：标题、部门/业务/日期、主旨、说明、明细表、银行信息。
 */
export function buildRebateDocx(data) {
  return new Promise((resolve, reject) => {
    const customer = String(data.customer || '').trim()
    const dir = A.ensureDir(path.join(A.customerDirAbs(customer), '佣金'))
    const stamp = new Date().toISOString().slice(0, 10)
    const base = `${customer}-回扣备案-${stamp}`.replace(/[\\/:*?"<>|]/g, '_')
    const docxPath = path.join(dir, base + '.docx')
    const pdfPath = path.join(dir, base + '.pdf')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crystal-rebate-'))
    const jsonPath = path.join(tmpDir, 'data.json')
    const psPath = path.join(tmpDir, 'make.ps1')
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8')

    const rows = Array.isArray(data.rows) ? data.rows : []
    const pad = (n) => String(n).padStart(2, '0')
    const d = new Date()
    const dateStr = data.date || `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    const ps = `
$ErrorActionPreference = 'Stop'
$data = Get-Content -Raw -Encoding UTF8 '${psQuote(jsonPath)}' | ConvertFrom-Json
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Add()
$doc.PageSetup.TopMargin = 42
$doc.PageSetup.BottomMargin = 42
$doc.PageSetup.LeftMargin = 42
$doc.PageSetup.RightMargin = 42

$sel = $word.Selection
$sel.ParagraphFormat.Alignment = 1
$sel.Font.Name = '宋体'
$sel.Font.Size = 18
$sel.Font.Bold = $true
$sel.TypeText('备　案　表')
$sel.TypeParagraph()

$sel.Font.Size = 10.5
$sel.Font.Bold = $false
$sel.ParagraphFormat.Alignment = 0
$sel.TypeText('部门：' + $data.department + '                          业务：' + $data.business + '                  日期：' + $data.date)
$sel.TypeParagraph()
$sel.TypeParagraph()

$sel.Font.Bold = $true
$sel.TypeText('主旨：' + $data.customer + ' 回扣事宜')
$sel.Font.Bold = $false
$sel.TypeParagraph()
$sel.TypeParagraph()

$sel.TypeText('　　客户情况描述：')
$sel.TypeParagraph()
$sel.TypeText('　　“' + $data.customer + '”物料所有货款均参照实际报价来结算，多出报价部分的均返还给客户，部分物料报价详情如下：')
$sel.TypeParagraph()
$sel.TypeText('货币单位：RMB')
$sel.TypeParagraph()

$rows = @($data.rows)
$count = $rows.Count + 1
$range = $doc.Content
$range.Collapse(0)
$table = $doc.Tables.Add($range, $count, 6)
$table.Borders.Enable = $true
$table.Range.Font.Name = '宋体'
$table.Range.Font.Size = 9
$headers = @('规格型号','是否含税','报价','下单单价','回扣方式','备注')
for ($c = 1; $c -le 6; $c++) {
  $table.Cell(1,$c).Range.Text = $headers[$c-1]
  $table.Cell(1,$c).Range.Font.Bold = $true
  $table.Cell(1,$c).Range.ParagraphFormat.Alignment = 1
}
for ($i = 0; $i -lt $rows.Count; $i++) {
  $r = $rows[$i]
  $cells = @($r.name, $(if ($r.taxable -eq $false) {'否'} else {'是'}), [string]$r.quote, [string]$r.order_price, [string]$r.method, [string]$r.remark)
  for ($c = 1; $c -le 6; $c++) {
    $table.Cell($i+2,$c).Range.Text = $cells[$c-1]
    $table.Cell($i+2,$c).Range.ParagraphFormat.Alignment = $(if ($c -eq 1 -or $c -eq 6) {0} else {1})
  }
}
$table.Columns.Item(1).Width = 200
$table.Columns.Item(2).Width = 45
$table.Columns.Item(3).Width = 60
$table.Columns.Item(4).Width = 60
$table.Columns.Item(5).Width = 75
$table.Columns.Item(6).Width = 70

$end = $doc.Content
$end.Collapse(0)
$end.InsertAfter("\`r\`n")
$end.InsertAfter('银行信息：')
$end.InsertAfter("\`r\`n户名：" + $data.account_name)
$end.InsertAfter("\`r\`n账号：" + $data.account_no)
$end.InsertAfter("\`r\`n开户银行：" + $data.bank_name)
$end.InsertAfter("\`r\`n")

$doc.SaveAs2('${psQuote(docxPath)}', 16)
$doc.ExportAsFixedFormat('${psQuote(pdfPath)}', 17)
$doc.Close($false)
$word.Quit()
Write-Output 'OK'
`
    fs.writeFileSync(psPath, '\ufeff' + ps, 'utf8')

    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath, jsonPath, docxPath, pdfPath], { timeout: 120000, windowsHide: true }, (err, stdout, stderr) => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
      if (err) {
        reject(new Error('生成备案表失败: ' + (stderr || err.message).slice(0, 300)))
        return
      }
      if (!fs.existsSync(docxPath)) {
        reject(new Error('生成备案表失败：没有输出文件'))
        return
      }
      resolve({ docxPath, pdfPath: fs.existsSync(pdfPath) ? pdfPath : '', date: dateStr })
    })
  })
}
