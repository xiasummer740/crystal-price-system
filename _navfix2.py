p="client/src/views/Dashboard.vue"
s=open(p,encoding="utf-8").read()
s=s.replace(".mobile-nav-strip { display: none; }\n.menu-text", ".mobile-nav-strip { display: none; }\n.menu-text",1)
s=s.replace("@media (max-width: 768px) {\n  .mobile-nav-strip {", "@media (max-width: 1100px) {\n  .mobile-nav-strip {",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
