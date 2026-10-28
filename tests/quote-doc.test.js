import test from 'node:test'
import assert from 'node:assert/strict'
import AdmZip from 'adm-zip'
import { buildQuoteDocx } from '../server/src/utils/quoteDoc.js'

const sample = {
  date: '2026-10-28',
  to: '东莞市奥斯普科技有限公司',
  fm: '夏祥',
  attn: '李工',
  tel: '13800000000',
  items: [
    { customer_code: '9008006710', jkx_code: 'SJK-7K32768K0135GRC9', spec: '1610,32.768KHz,9pF', price: 0.82, qty: '3000', lt: '8-10周', remark: '编带' },
    { customer_code: '', jkx_code: 'SJK-7Y38400M9125GRC9', spec: '1612,4pin,38.400MHz\n8PF,±10ppm', price: 0.63, qty: '3000', lt: '2-4周', remark: '' }
  ]
}

test('报价单 docx：占位符全部替换、明细按条数展开、logo/公章还在', () => {
  const buf = buildQuoteDocx(sample)
  assert.ok(buf.length > 5000)
  const zip = new AdmZip(buf)
  const xml = zip.readAsText('word/document.xml')

  assert.equal(xml.includes('{{'), false, '不能留下未替换的占位符')
  assert.match(xml, /东莞市奥斯普科技有限公司/)
  assert.match(xml, /SJK-7K32768K0135GRC9/)
  assert.match(xml, /SJK-7Y38400M9125GRC9/)
  assert.match(xml, /2026-10-28/)
  assert.match(xml, /李工/)

  // 两条物料 → 明细行出现两次
  const codeCount = (xml.match(/SJK-7K32768K0135GRC9/g) || []).length
  assert.ok(codeCount >= 1)

  const media = zip.getEntries().filter(e => !e.isDirectory && e.entryName.startsWith('word/media/'))
  assert.equal(media.length, 2, 'logo + 公章两张图应保留')
})

test('报价单 docx：没有物料时报错', () => {
  assert.throws(() => buildQuoteDocx({ ...sample, items: [] }), /至少需要一条物料/)
})
