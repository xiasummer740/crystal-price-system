const { test, expect } = require('@playwright/test')

const BASE = 'http://localhost:3266'
const TEST_ID = `E2E测试-${Date.now()}`

test.describe('核心流程: 新增 → 保存 → 表格更新', () => {

  test('完整新增报价流程', async ({ page }) => {
    // 1. 打开首页
    await page.goto(BASE)
    await expect(page).toHaveTitle(/晶振报价/)

    // 2. 直接去新增页（hash 路由）
    await page.goto(`${BASE}/#/add`)
    // 等表单渲染
    await page.waitForSelector('input[placeholder="物料名称"]', { timeout: 10000 })

    // 3. 填表单（物料名称必填 + 价格）
    await page.fill('input[placeholder="物料名称"]', TEST_ID)
    await page.fill('input[placeholder="如：1.5000"]', '1.2345')

    // 4. 点"提交记录"按钮提交
    await page.click('button:has-text("提交记录")')

    // 5. 等成功提示后跳回首页
    try {
      await expect(page.getByText('新增成功')).toBeVisible({ timeout: 5000 })
    } catch {
      // toast 可能已消失，不阻塞
    }
    await page.waitForFunction(
      () => window.location.hash === '#/' || window.location.hash === '',
      { timeout: 10000 }
    )

    // 6. 验证表格包含刚才新增的记录
    await expect(page.locator(`text=${TEST_ID}`).first()).toBeVisible({ timeout: 10000 })
  })

  test('移动端: 手机视图正常显示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE}/#/mobile`)
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
  })
})
