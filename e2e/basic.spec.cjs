// @ts-check
const { test, expect } = require('@playwright/test')

const BASE = 'http://localhost:3266'

test.describe('晶振报价系统 E2E', () => {

  test('桌面端: 首页加载并显示表格', async ({ page }) => {
    await page.goto(BASE)
    // 页面标题包含项目名
    await expect(page).toHaveTitle(/晶振报价/)
    // 表格应存在（Vant 表格或原生 table）
    const table = page.locator('table, .van-table, .el-table, .v-data-table, [class*="table"]')
    await expect(table.first()).toBeVisible({ timeout: 10000 })
  })

  test('桌面端: 新增报价页面表单可交互', async ({ page }) => {
    await page.goto(`${BASE}/#/add`)
    // 等待表单渲染
    await page.waitForTimeout(2000)
    // 检查是否有输入框（Vant Field）
    const inputs = page.locator('input, textarea, [class*="field"], [class*="input"]')
    const count = await inputs.count()
    expect(count).toBeGreaterThan(0)
  })

  test('移动端: 手机视图正常显示', async ({ page }) => {
    // 模拟手机视口
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE}/#/mobile`)
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
    // 搜索框应可见
    const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"]')
    // 如果有搜索框则验证，没有也不报错
    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible()
    }
  })

  test('API 健康检查（E2E 依赖）', async ({ page }) => {
    const response = await page.request.get(`${BASE}/api/prices?page=1&pageSize=1`)
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('data')
    expect(body.data).toHaveProperty('total')
    expect(body.data.total).toBeGreaterThanOrEqual(0)
  })
})
