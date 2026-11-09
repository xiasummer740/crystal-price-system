p="electron/updater.js"
s=open(p,encoding="utf-8").read()

# 统一的静默安装参数
anchor = "export function quitAndInstall() {"
add = '''/**
 * 静默安装参数：/S 不弹安装向导，/D= 保持原安装目录（必须是最后一个参数）。
 * NSIS 的 /D 不能加引号；安装目录通常不含空格（%LOCALAPPDATA%\\Programs\\...）。
 */
function silentInstallerArgs() {
  let dir = ''
  try {
    const { app } = _require('electron')
    dir = path.dirname(app.getPath('exe'))
  } catch {}
  const args = ['/S', '--updated']
  if (dir && !dir.includes('"')) args.push(`/D=${dir}`)
  return args
}

'''
assert anchor in s
s = s.replace(anchor, add + anchor, 1)

# quitAndInstall 直连分支
s = s.replace("""    const { spawn } = _require('child_process')
    spawn(directDownloadPath, ['--updated'], { detached: true, stdio: 'ignore' })
    const { app } = _require('electron')
    app.quit()""","""    const { spawn } = _require('child_process')
    spawn(directDownloadPath, silentInstallerArgs(), { detached: true, stdio: 'ignore' })
    const { app } = _require('electron')
    app.quit()""",1)

# installOnQuit 直连分支
s = s.replace("""    const { spawn } = _require('child_process')
    spawn(directDownloadPath, ['--updated'], { detached: true, stdio: 'ignore' })
    return true""","""    const { spawn } = _require('child_process')
    spawn(directDownloadPath, silentInstallerArgs(), { detached: true, stdio: 'ignore' })
    return true""",1)
open(p,"w",encoding="utf-8",newline="").write(s)
print("ok")
