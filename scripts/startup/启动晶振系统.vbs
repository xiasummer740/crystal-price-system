' ===========================================================
'  开机静默启动晶振报价管理系统
'
'  使用方法：
'    1. 把此文件复制（或创建快捷方式）到：
'       Win + R → shell:startup → 粘贴进去
'    2. 修改下方 exePath 为你电脑上晶振系统的实际路径
'       默认路径：%LOCALAPPDATA%\Programs\晶振报价管理系统\晶振报价管理系统.exe
'
'  说明：
'    - 静默启动（不显示控制台）
'    - cloudflared 隧道由 Windows 服务自动启动，不需要这里处理
' ===========================================================

Set WshShell = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 优先用 %LOCALAPPDATA% 路径（per-user 安装默认位置）
exePath = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\晶振报价管理系统\晶振报价管理系统.exe"

' 如果默认路径找不到，尝试同目录（如果此 vbs 放在安装目录）
If Not fso.FileExists(exePath) Then
    exePath = fso.GetParentFolderName(WScript.ScriptFullName) & "\晶振报价管理系统.exe"
End If

If fso.FileExists(exePath) Then
    WshShell.Run """" & exePath & """", 0, False
Else
    MsgBox "未找到晶振报价管理系统.exe" & vbCrLf & vbCrLf & _
           "已检查路径：" & vbCrLf & exePath & vbCrLf & vbCrLf & _
           "请打开此 vbs 文件，修改 exePath 为实际安装路径。", _
           vbExclamation, "启动失败"
End If
