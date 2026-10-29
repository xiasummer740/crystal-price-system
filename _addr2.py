p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace("/** 报价页面：按物料编码取最近一条报价 */","/** 客户收货地址（地图地址页的收货点/联系人地址） */\nexport function fetchCustomerAddresses(customer) {\n  return http.get('/materials/customer-addresses', { params: { customer } })\n}\n/** 报价页面：按物料编码取最近一条报价 */")
open(p,"w",encoding="utf-8",newline="").write(s)
print("api ok")
