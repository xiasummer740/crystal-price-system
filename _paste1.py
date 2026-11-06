p="client/src/components/CustomerFiles.vue"
s=open(p,encoding="utf-8").read()
s=s.replace("import { computed, reactive, ref, watch, onBeforeUnmount, onMounted } from 'vue'","import { computed, reactive, ref, watch } from 'vue'",1)
s=s.replace("onMounted(() => window.addEventListener('paste', onPaste))\nonBeforeUnmount(() => window.removeEventListener('paste', onPaste))\n","",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
