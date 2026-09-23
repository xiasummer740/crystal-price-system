const { defineConfig } = require('@playwright/test')
// 这里就 import 是为了「没设 E2E_BASE 时立刻报错」—— 配置加载早于用例，
// 拦住得最快。（以前这里写死的 3266 是软件生产端口，会把测试打到真实库上）
const { BASE } = require('./e2e/_base.cjs')

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: BASE,
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
