---
name: crystal-price-v1.0.2-navigation-fix
description: 晶振报价管理系统 v1.0.2 导航修复 + 路由标准化，后续改动以此为基线
type: project
originSessionId: 5fe942d8-130c-46cf-bc3f-681a06ec0b50
---
v1.0.2 版本修复了两个关键 Bug：
1. **Set 对象显示问题** — Dashboard 中 `materialKinds` computed 正确使用了 `.size`，重新构建前端和 exe 后解决
2. **页面导航无反应** — 将所有 `<a href="/#/...">` 改为 `<router-link to="...">`；修复 MobileHome 中 `van-tabbar` 的 `route` 属性与 `@click` 冲突（改用 `to` 属性）
3. 删除了 Dashboard 中未使用的导航函数（goAdd, goMobile, goSamples, goEdit）

**Why:** 用户运行 v1.0.1 exe 时发现两个 bug，这是该项目的第三个修复版本。
**How to apply:** 后续所有页面导航统一使用 `<router-link>` 或 `router.push()`，禁止使用原生 `<a href="/#/...">` 和 `location.href` 进行 SPA 内部跳转。
