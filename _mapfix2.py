p="client/src/views/MapAddresses.vue"
s=open(p,encoding="utf-8").read()
bad = '''  customerContacts.value = [];
  addressHistory.value = [];
  if (c.id) {
    fetchMapAddressHistory(c.id)
      .then((r) => { addressHistory.value = r.data || []; })
      .catch(() => {});
  }
  showCustomerForm.value = true;
}'''
good = '''  customerContacts.value = [];
  addressHistory.value = [];
  showCustomerForm.value = true;
}'''
assert bad in s
s=s.replace(bad, good, 1)

old_edit = '''function editCustomer(c) {
  editingCustomer.value = c;
  customerForm.name = c.name;
  customerForm.phone = c.phone || "";
  customerForm.address = c.address || "";
  customerForm.latitude = c.latitude;
  customerForm.longitude = c.longitude;
  customerForm.notes = c.notes || "";
  customerContacts.value = [];
  showCustomerForm.value = true;'''
new_edit = '''function editCustomer(c) {
  editingCustomer.value = c;
  customerForm.name = c.name;
  customerForm.phone = c.phone || "";
  customerForm.address = c.address || "";
  customerForm.latitude = c.latitude;
  customerForm.longitude = c.longitude;
  customerForm.notes = c.notes || "";
  customerContacts.value = [];
  addressHistory.value = [];
  if (c.id) {
    fetchMapAddressHistory(c.id)
      .then((r) => { addressHistory.value = r.data || []; })
      .catch(() => {});
  }
  showCustomerForm.value = true;'''
assert old_edit in s
s=s.replace(old_edit,new_edit,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
