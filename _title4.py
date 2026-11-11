p="client/src/utils/api.js"
s=open(p,encoding="utf-8").read()
s=s.replace("/** 客户收货地址（地图地址页的收货点/联系人地址） */","/** 客户抬头（同一客户下多家开票主体） */\nexport function fetchCustomerTitles(customer) {\n  return http.get('/customer-titles', { params: { customer } })\n}\nexport function createCustomerTitle(data) {\n  return http.post('/customer-titles', data)\n}\nexport function updateCustomerTitle(id, data) {\n  return http.put(`/customer-titles/${id}`, data)\n}\nexport function deleteCustomerTitle(id) {\n  return http.delete(`/customer-titles/${id}`)\n}\n/** 客户收货地址（地图地址页的收货点/联系人地址） */")
open(p,"w",encoding="utf-8",newline="").write(s)
print("api ok")
