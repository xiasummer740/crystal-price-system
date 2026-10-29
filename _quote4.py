p="client/src/views/Materials.vue"
s=open(p,encoding="utf-8").read()
s=s.replace("import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'","import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
