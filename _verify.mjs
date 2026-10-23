import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: process.env.USERPROFILE + '\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe' })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, permissions: ['clipboard-read','clipboard-write'] })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('[pageerror]', e.message))

// 1) 首页表头分割线
await page.goto('http://127.0.0.1:3267/#/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
const th = page.locator('.dt th').nth(1)
console.log('th border-right:', await th.evaluate(el => getComputedStyle(el).borderRightWidth + ' ' + getComputedStyle(el).borderRightColor))
const box = await page.locator('.table-shell').boundingBox()
await page.screenshot({ path: 'D:\\dsh-workspace\\晶振报价软件\\_订单测试版预览\\20-表头分割线.png', clip: { x: box.x, y: box.y, width: Math.min(box.width, 1400), height: 90 } })

// 2) 客户物料：报价格里的复制图标
await page.goto('http://127.0.0.1:3267/#/materials', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const card = page.locator('.grid-card', { hasText: '深圳市国润聚源科技有限公司' }).first()
if (await card.count()) { await card.click(); await page.waitForTimeout(2500) }
console.log('pair icons:', await page.locator('.pair-copy').count())
await page.locator('.pair-copy').first().click()
await page.waitForTimeout(500)
console.log('pair clip:', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())))

// 3) 编辑表单里的规格书复制
await page.locator('.edit-btn-sm').first().click()
await page.waitForTimeout(1200)
const specBtn = page.locator('.spec-current .spec-action', { hasText: '复制' })
console.log('spec copy btn:', await specBtn.count())
const spec = page.locator('.spec-section')
await spec.scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
const sb = await spec.boundingBox()
await page.screenshot({ path: 'D:\\dsh-workspace\\晶振报价软件\\_订单测试版预览\\19-规格书复制按钮.png', clip: { x: Math.max(0, sb.x - 8), y: sb.y - 8, width: Math.min(820, sb.width + 16), height: sb.height + 16 } })
await specBtn.click()
await page.waitForTimeout(900)
console.log('toast:', (await page.locator('.van-toast').innerText().catch(() => '')).trim())
await browser.close()
console.log('done')
