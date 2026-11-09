p="server/src/routes/customerFiles.js"
s=open(p,encoding="utf-8").read()

old='''function folderAbs(customer, folder) {
  const root = filesRoot(customer)
  const name = safeName(folder)
  if (!name) return null
  const abs = path.join(root, name)
  if (!abs.startsWith(root + path.sep)) return null
  return { root, name, abs }
}'''
new='''function folderSegments(raw) {
  return String(raw || '')
    .split(/[\\\\/]+/)
    .map((s) => safeName(s))
    .filter(Boolean)
}

function folderAbs(customer, folder) {
  const root = filesRoot(customer)
  const segs = folderSegments(folder)
  if (!segs.length) return null
  const abs = path.join(root, ...segs)
  if (!abs.startsWith(root + path.sep)) return null
  return { root, name: segs.join('/'), abs }
}'''
assert old in s
s=s.replace(old,new,1)

old2='''    const root = filesRoot(customer)
    const folders = []
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const abs = path.join(root, e.name)
      const files = []
      for (const f of fs.readdirSync(abs, { withFileTypes: true })) {
        if (!f.isFile() || f.name.startsWith('.')) continue
        let st
        try { st = fs.statSync(path.join(abs, f.name)) } catch { continue }
        files.push({ name: f.name, size: st.size, mtime: st.mtime.toISOString() })
      }
      files.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
      folders.push({ name: e.name, files })
    }
    folders.sort((a, b) => String(b.name).localeCompare(String(a.name)))'''
new2='''    const root = filesRoot(customer)
    const folders = []
    // 递归收集子文件夹（祥哥 2026-11-09：文件夹里还能再建文件夹）
    const walk = (dir, rel) => {
      let entries = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (!e.isDirectory()) continue
        const abs = path.join(dir, e.name)
        const relPath = rel ? rel + '/' + e.name : e.name
        const files = []
        for (const f of fs.readdirSync(abs, { withFileTypes: true })) {
          if (!f.isFile() || f.name.startsWith('.')) continue
          let st
          try { st = fs.statSync(path.join(abs, f.name)) } catch { continue }
          files.push({ name: f.name, size: st.size, mtime: st.mtime.toISOString() })
        }
        files.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
        folders.push({ name: e.name, path: relPath, files })
        walk(abs, relPath)
      }
    }
    walk(root, '')
    folders.sort((a, b) => String(a.path).localeCompare(String(b.path), 'zh'))'''
assert old2 in s
s=s.replace(old2,new2,1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("server ok")
