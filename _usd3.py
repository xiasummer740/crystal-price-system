p="client/src/views/AddRecord.vue"
s=open(p,encoding="utf-8").read()
s=s.replace('''          <van-field v-model.number="form.price_with_tax" label="含税价" placeholder="如：1.5000" type="number" :rules="[{ validator: v => v===null||v===''||v>=0, message:'价格不能为负' }]" @change="onPriceWithTaxChange" />''','''          <van-field v-if="form.currency !== 'USD'" v-model.number="form.price_with_tax" label="含税价" placeholder="如：1.5000" type="number" :rules="[{ validator: v => v===null||v===''||v>=0, message:'价格不能为负' }]" @change="onPriceWithTaxChange" />
          <van-cell v-else title="含税价" value="美元报价只有未税价" />''',1)
s=s.replace('''function onCurrencyConfirm({ selectedOptions }) { form.value.currency = selectedOptions[0].value; showCurrencyPicker.value = false }''','''function onCurrencyConfirm({ selectedOptions }) {
  form.value.currency = selectedOptions[0].value
  // 美元只有未税价，切到 USD 时清掉含税价
  if (form.value.currency === 'USD') form.value.price_with_tax = null
  showCurrencyPicker.value = false
}''',1)
s=s.replace('''function onPriceWithoutTaxChange() { const v = form.value.price_without_tax; if (v && !form.value.price_with_tax) { form.value.price_with_tax = parseFloat((v * (1 + autoTaxRate()/100)).toFixed(4)) } }''','''function onPriceWithoutTaxChange() {
  const v = form.value.price_without_tax
  // 美元报价不推算含税价
  if (form.value.currency === 'USD') return
  if (v && !form.value.price_with_tax) { form.value.price_with_tax = parseFloat((v * (1 + autoTaxRate()/100)).toFixed(4)) }
}''',1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("addrecord ok")
