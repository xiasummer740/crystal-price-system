import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: process.env.USERPROFILE + '\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe' })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:3267/#/materials', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const card = page.locator('.grid-card', { hasText: '深圳市国润聚源科技有限公司' }).first()
if (await card.count()) { await card.click(); await page.waitForTimeout(2500) }
console.log('rows', await page.locator('.mat-row').count(), 'pair', await page.locator('.pair-btn').count())
const btn = page.locator('.pair-btn').first()
if (await btn.count()) {
  const b = await btn.boundingBox(); console.log('box', b)
  console.log('style', await btn.evaluate(el => { const s=getComputedStyle(el); return {display:s.display, visibility:s.visibility, pointer:s.pointerEvents, w:el.offsetWidth, h:el.offsetHeight, pos:s.position, z:s.zIndex} }))
  await btn.click({ force: true })
  await page.waitForTimeout(600)
  console.log('clip', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())))
}
await browser.close()
