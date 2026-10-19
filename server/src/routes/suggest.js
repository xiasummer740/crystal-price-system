import { Router } from 'express'
import { SCOPES, scopeFields, fieldValues, codeCandidates, formSuggestions } from '../utils/suggest.js'

const router = Router()

/** scope 白名单校验；不合法直接 400，别让它往下走到查表 */
function readScope(req, res) {
  const scope = String(req.query.scope || '')
  if (!SCOPES.includes(scope)) {
    res.status(400).json({ code: 1, msg: '无效的 scope，可选：' + SCOPES.join(' / ') })
    return ''
  }
  return scope
}

// 整张表单的候选：打开表单时拉一次，前端本地过滤
// GET /api/suggest/form?scope=samples[&customer=XX]
router.get('/form', (req, res) => {
  const scope = readScope(req, res)
  if (!scope) return
  res.json({
    code: 0,
    data: formSuggestions(scope, {
      limit: req.query.limit || 30,
      customer: String(req.query.customer || '')
    })
  })
})

// 单个字段的历史值（按使用次数倒序）
// GET /api/suggest/field/brand?scope=samples&kw=T&limit=20
router.get('/field/:field', (req, res) => {
  const scope = readScope(req, res)
  if (!scope) return
  const field = String(req.params.field || '')
  if (!scopeFields(scope).includes(field)) {
    return res.status(400).json({ code: 1, msg: `field「${field}」不在 ${scope} 的候选字段里` })
  }
  res.json({
    code: 0,
    data: fieldValues(scope, field, {
      keyword: String(req.query.kw || ''),
      limit: req.query.limit || 30,
      customer: String(req.query.customer || '')
    })
  })
})

// 物料档案（料号 + 名称 + 技术参数），选中后前端一次性回填
// GET /api/suggest/codes?scope=materials&kw=SJK
router.get('/codes', (req, res) => {
  const scope = readScope(req, res)
  if (!scope) return
  res.json({
    code: 0,
    data: codeCandidates(scope, {
      keyword: String(req.query.kw || ''),
      limit: req.query.limit || 400
    })
  })
})

export default router
