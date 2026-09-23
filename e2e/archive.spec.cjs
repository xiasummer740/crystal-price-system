// 客户资料归档改造的浏览器验证：规格书链接必须真的能打开（改造前是 21 条 404）
const { test, expect } = require('@playwright/test')

// 默认打本机正式端口；跑沙箱时用 E2E_BASE 覆盖，别把测试打到生产数据上。
// 例：E2E_BASE=http://127.0.0.1:3277 npx playwright test e2e/archive.spec.cjs
const BASE = process.env.E2E_BASE || 'http://localhost:3266'

test.describe('客户资料归档', () => {

  test('归档后规格书/备注图链接在浏览器里真能取到（不再 404）', async ({ request }) => {
    // 拿一条真实记录，检查它库里的每个附件 URL
    const res = await request.get(`${BASE}/api/prices?page=1&pageSize=200`)
    expect(res.ok()).toBeTruthy()
    const list = (await res.json()).data?.list || []

    const refs = []
    for (const r of list) {
      if (r.spec_document) refs.push({ id: r.id, url: r.spec_document })
      try {
        for (const u of JSON.parse(r.remark_images || '[]')) refs.push({ id: r.id, url: u })
      } catch { /* 忽略脏数据 */ }
    }
    expect(refs.length, '应至少有一条带附件的记录').toBeGreaterThan(0)

    let bad = 0
    for (const ref of refs) {
      const r = await request.get(BASE + ref.url.split('?')[0])
      if (r.status() !== 200) { bad++; console.log(`✘ ${ref.url} → ${r.status()}`) }
    }
    expect(bad, `${refs.length} 条附件引用应全部可取`).toBe(0)
  })

  test('数据库里不再残留指向旧目录的附件 URL', async ({ request }) => {
    const res = await request.get(`${BASE}/api/prices?page=1&pageSize=200`)
    const list = (await res.json()).data?.list || []
    const stale = []
    for (const r of list) {
      const urls = [r.spec_document, ...(() => { try { return JSON.parse(r.remark_images || '[]') } catch { return [] } })()].filter(Boolean)
      for (const u of urls) {
        if (/^\/api\/(uploads\/(prices|materials|notes)|specs)\//.test(u)) stale.push(u)
      }
    }
    expect(stale, `不该再有旧前缀 URL: ${stale.slice(0, 5).join(', ')}`).toHaveLength(0)
  })

  test('桌面端首页与详情页正常渲染，规格书显示名可读', async ({ page }) => {
    await page.goto(BASE)
    await expect(page).toHaveTitle(/晶振报价/)
    // 首页表格渲染出来
    await page.waitForSelector('table, .van-list, .empty', { timeout: 15000 })

    // 进详情页看规格书一栏（若有带规格书的记录）
    const res = await page.request.get(`${BASE}/api/prices?page=1&pageSize=200`)
    const list = (await res.json()).data?.list || []
    const withSpec = list.find(r => r.spec_document)
    if (!withSpec) return test.skip(true, '沙箱里没有带规格书的记录')

    await page.goto(`${BASE}/#/detail/${withSpec.id}`)
    await page.waitForLoadState('networkidle')
    // 显示名不能是 URL 编码后的乱码，也不能是空
    const linkText = await page.locator('.spec-link').first().textContent().catch(() => null)
    if (linkText !== null) {
      expect(linkText.trim().length).toBeGreaterThan(0)
      expect(linkText).not.toContain('%E')   // 未解码的百分号编码
      expect(linkText).not.toContain('/api/') // 整条 URL 直接显示出来
    }
  })
})
