import { chromium } from 'playwright'

const browser = await chromium.launch({
  executablePath: process.env.USERPROFILE + '\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe'
})
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message))

await page.goto('http://127.0.0.1:3267/#/materials?customer=' + encodeURIComponent('深圳市国润聚源科技有限公司'), { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
console.log('rows:', await page.locator('.mat-row').count())
console.log('pair buttons:', await page.locator('.pair-btn').count())

await page.locator('.pair-btn').first().click()
await page.waitForTimeout(600)
const txt = await page.evaluate(() => navigator.clipboard.readText())
console.log('clipboard text:', JSON.stringify(txt))

// 打开编辑表单看规格书复制按钮
await page.locator('.edit-btn-sm').first().click()
await page.waitForTimeout(1200)
const specBtn = page.locator('.spec-current .spec-action', { hasText: '复制' })
console.log('spec copy button:', await specBtn.count())
const spec = page.locator('.spec-section')
await spec.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const box = await spec.boundingBox()
await page.screenshot({ path: 'D:\\dsh-workspace\\晶振报价软件\\_订单测试版预览\\19-规格书复制按钮.png', clip: { x: Math.max(0, box.x - 10), y: box.y - 10, width: Math.min(760, box.width + 20), height: box.height + 20 } })
await specBtn.click()
await page.waitForTimeout(800)
console.log('toast:', (await page.locator('.van-toast').innerText().catch(() => '')).trim())

await browser.close()
console.log('done')
