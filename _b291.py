import re, json
p="package.json"
s=open(p,encoding="utf-8").read()
s=re.sub(r'"version":\s*"1\.0\.290"','"version": "1.0.291"',s,count=1)
open(p,"w",encoding="utf-8",newline="").write(s)
print(json.load(open(p,encoding="utf-8"))["version"])
