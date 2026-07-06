; ===========================================================
;  晶振报价管理系统 v1.0.12 NSIS 自定义脚本
; ===========================================================
;
;  改动说明（v1.0.11 → v1.0.12）：
;   1. customInit 开头加守卫：data-dir.txt 已存在则跳过弹窗
;      （修复 UAC 提权后 customInit 被调用两次导致重复弹窗）
;   2. 安装时在数据目录创建 .crystal-marker 标记文件
;   3. 卸载校验改为 data.db 或 .crystal-marker 任一存在即认
;      （修复装完没启动过就卸载时找不到数据目录的问题）
;   4. RMDir 前仍保留 data.db 或 .crystal-marker 校验（双重防线）
;
;  改动说明（v1.0.10 → v1.0.11）：⚠️ 紧急安全修复
;   1. 删除「手动选目录」分支（v1.0.10 误删用户文件的根本原因）
;   2. 完全依赖自动检测：data-dir.txt → Documents → INSTDIR
;   3. 自动检测路径强制要求 data.db 存在（之前 *.* 过于宽松）
;   4. RMDir /r 前再校验一次 data.db（双重防线）
;   5. 弹窗文字全部简化（小白用户可看懂）
;   6. 二次确认默认按钮永远是「取消」，需要主动点「删除」
;
;  寄存器约定：
;   customInit 用 $8 (数据目录) / $9 (文件句柄)
;   customUnInstall 用 $0-$4（保持 v1.0.7 约定）
;
; ===========================================================

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; -----------------------------------------------------------
;  全局变量
; -----------------------------------------------------------
; 注：v1.0.6+ 不再用 Var 声明 DataDir（NSIS 把 .nsh 同时 include
; 进安装器与卸载器，安装器侧用不到会触发 warning 6001）。
; 改用 customUnInstall 宏内寄存器 $4 暂存数据目录路径。
;
; ===========================================================
;  安装前：强杀旧版进程（用 nsProcess 原生插件，比 taskkill 更可靠）
; ===========================================================
!macro customCheckAppRunning
  DetailPrint `正在强制关闭旧版 ${PRODUCT_NAME}...`
  nsProcess::_KillProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  ${if} $R0 != 0
    DetailPrint `nsProcess kill 返回: $R0，尝试 taskkill 兜底...`
    nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" 2>nul`
  ${endIf}
  Sleep 1000
!macroend

; ===========================================================
;  安装前：让用户选择数据目录 + 备份 v1.0.5 老数据
; ===========================================================
!macro customInit
  ; ----- v1.0.12 守卫：data-dir.txt 已存在则跳过弹窗（防 UAC 提权后重复触发） -----
  IfFileExists "$APPDATA\crystal-price-system\data-dir.txt" skipDataDirSetup 0

  ; ----- v1.0.11：让用户选数据目录（弹窗文字简化） -----
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "数据要放到 D 盘或 E 盘吗？$\n$\n推荐：是（避免占用 C 盘）$\n如果不确定，选「否」用默认位置（我的文档）" \
    /SD IDYES IDYES customDirAsk IDNO useDefaultDataDir

  customDirAsk:
    nsDialogs::SelectFolderDialog "选一个文件夹（程序会在里面建『晶振报价管理系统』存数据）" "D:\"
    Pop $8
    StrCmp $8 "error" useDefaultDataDir 0
    StrCpy $8 "$8\晶振报价管理系统"
    Goto saveDataDirChoice

  useDefaultDataDir:
    StrCpy $8 "$DOCUMENTS\晶振报价管理系统"

  saveDataDirChoice:
    CreateDirectory "$8"
    CreateDirectory "$APPDATA\crystal-price-system"
    ; 删除旧的 user-data-path.json，强制使用本次选择
    Delete "$APPDATA\crystal-price-system\user-data-path.json"
    ; 写 data-dir.txt 用 FileWriteUTF16LE /BOM（v1.0.10 修复乱码问题）
    FileOpen $9 "$APPDATA\crystal-price-system\data-dir.txt" w
    FileWriteUTF16LE /BOM $9 "$8"
    FileClose $9
    ; v1.0.12 新增：在数据目录创建 marker 文件，卸载时校验用
    FileOpen $9 "$8\.crystal-marker" w
    FileWrite $9 "crystal-price-system install marker"
    FileClose $9
    DetailPrint "[install] 数据目录设置为: $8"
    ; 告知用户：下一页是程序安装目录，不是数据目录
    MessageBox MB_OK|MB_ICONINFORMATION \
      "✓ 数据位置已设好$\n$\n$8$\n$\n下一页会让你选「程序装在哪」，那是程序本体，跟数据无关。" \
      /SD IDOK

  skipDataDirSetup:

  ; ----- 原有 v1.0.5 兼容备份逻辑 -----
  IfFileExists "$INSTDIR\晶振报价管理系统\数据库\data.db" 0 skipBackup
    CreateDirectory "$TEMP\晶振备份\数据库"
    CreateDirectory "$TEMP\晶振备份\规格书"
    CreateDirectory "$TEMP\晶振备份\模板"
    CreateDirectory "$TEMP\晶振备份\备份"
    CreateDirectory "$TEMP\晶振备份\Excel备份"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\数据库\*.*" "$TEMP\晶振备份\数据库"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\规格书\*.*" "$TEMP\晶振备份\规格书"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\模板\*.*" "$TEMP\晶振备份\模板"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\备份\*.*" "$TEMP\晶振备份\备份"
    CopyFiles /SILENT "$INSTDIR\晶振报价管理系统\Excel备份\*.*" "$TEMP\晶振备份\Excel备份"
  skipBackup:
!macroend

; ===========================================================
;  安装后：恢复数据（兼容 v1.0.5 老用户）
;  注：v1.0.6+ 启动时 electron/main.js 的 resolveDataDir() 会
;  探测 $INSTDIR 下的数据并自动迁移到 Documents 目录。
; ===========================================================
!macro customInstall
  IfFileExists "$TEMP\晶振备份\数据库\data.db" 0 tryAppData
    CreateDirectory "$INSTDIR\晶振报价管理系统\数据库"
    CreateDirectory "$INSTDIR\晶振报价管理系统\规格书"
    CreateDirectory "$INSTDIR\晶振报价管理系统\模板"
    CreateDirectory "$INSTDIR\晶振报价管理系统\备份"
    CreateDirectory "$INSTDIR\晶振报价管理系统\Excel备份"
    CopyFiles /SILENT "$TEMP\晶振备份\数据库\*.*" "$INSTDIR\晶振报价管理系统\数据库"
    CopyFiles /SILENT "$TEMP\晶振备份\规格书\*.*" "$INSTDIR\晶振报价管理系统\规格书"
    CopyFiles /SILENT "$TEMP\晶振备份\模板\*.*" "$INSTDIR\晶振报价管理系统\模板"
    CopyFiles /SILENT "$TEMP\晶振备份\备份\*.*" "$INSTDIR\晶振报价管理系统\备份"
    CopyFiles /SILENT "$TEMP\晶振备份\Excel备份\*.*" "$INSTDIR\晶振报价管理系统\Excel备份"
    RMDir /r "$TEMP\晶振备份"
    Goto doneInstall
  tryAppData:
  IfFileExists "$APPDATA\crystal-price-system\data.db" 0 doneInstall
    CreateDirectory "$INSTDIR\晶振报价管理系统\数据库"
    CopyFiles /SILENT "$APPDATA\crystal-price-system\data.db" "$INSTDIR\晶振报价管理系统\数据库"
  doneInstall:
!macroend

; ===========================================================
;  卸载：v1.0.7 始终弹窗 + 多路径搜索
;   搜索顺序：
;     ① $APPDATA\crystal-price-system\data-dir.txt (UTF-16 LE+BOM)
;     ② $DOCUMENTS\晶振报价管理系统  (新默认位置)
;     ③ $INSTDIR\晶振报价管理系统    (v1.0.5 老位置)
;   找到任一 → 弹"删除/保留"二选一 + 二次确认
;   都没找到 → 弹"未检测到数据"告知框（保证有交互，避免误以为无声删除）
; ===========================================================
!macro customUnInstall
  ; ----- 步骤 1：尝试读 APPDATA\crystal-price-system\data-dir.txt -----
  StrCpy $4 ""
  IfFileExists "$APPDATA\crystal-price-system\data-dir.txt" 0 unTryDocs
  ClearErrors
  FileOpen $0 "$APPDATA\crystal-price-system\data-dir.txt" r
  IfErrors unTryDocs
  FileRead $0 $1
  IfErrors unReadClose
  StrCpy $4 $1
  ; 去掉行尾 CR/LF
  unTrimLoop:
    StrLen $2 $4
    IntCmp $2 0 unTrimDone unTrimDone +1
    IntOp $2 $2 - 1
    StrCpy $3 $4 1 $2
    StrCmp $3 "$\r" unCutOne
    StrCmp $3 "$\n" unCutOne
    Goto unTrimDone
    unCutOne:
      StrCpy $4 $4 $2
      Goto unTrimLoop
  unTrimDone:
  unReadClose:
    FileClose $0

  ; ----- 步骤 2：v1.0.12 — data.db 或 .crystal-marker 任一存在即认 -----
  StrCmp $4 "" unTryDocs 0
  IfFileExists "$4\数据库\data.db" unAskUser 0
  IfFileExists "$4\data.db" unAskUser 0
  IfFileExists "$4\.crystal-marker" unAskUser unTryDocs

  ; ----- 步骤 3：尝试 Documents\晶振报价管理系统 (新版默认位置) -----
  unTryDocs:
  StrCpy $4 "$DOCUMENTS\晶振报价管理系统"
  IfFileExists "$4\数据库\data.db" unAskUser 0
  IfFileExists "$4\data.db" unAskUser 0
  IfFileExists "$4\.crystal-marker" unAskUser 0

  ; ----- 步骤 4：尝试 $INSTDIR\晶振报价管理系统 (v1.0.5 老位置) -----
  StrCpy $4 "$INSTDIR\晶振报价管理系统"
  IfFileExists "$4\数据库\data.db" unAskUser 0
  IfFileExists "$4\data.db" unAskUser 0
  IfFileExists "$4\.crystal-marker" unAskUser 0

  ; ----- 步骤 5：都没找到 -----
  StrCpy $4 ""

  unAskUser:
  StrCmp $4 "" unNoData unHasData

  ; ----- 用户跳过或未检测到：仅告知 -----
  unNoData:
    MessageBox MB_OK|MB_ICONINFORMATION \
      "未检测到本程序数据。$\n$\n程序文件会被卸载，如果您把数据放在自定义位置，请自行去那里处理。" \
      /SD IDOK
    Goto unCleanupTemp

  ; ----- 找到数据：首问 删除/保留，默认 IDNO（保留） -----
  unHasData:
    MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION \
      "要删除所有数据吗？$\n$\n点「否」保留（推荐，下次安装可继续用）$\n点「是」永久删除$\n$\n目录：$4" \
      /SD IDNO IDYES unConfirmDelete IDNO unKeepData

  unConfirmDelete:
    ; ----- 二次确认，默认 IDNO（取消） -----
    MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONEXCLAMATION \
      "⚠️ 最后确认！$\n$\n即将永久删除：$4$\n$\n此操作无法撤销，数据无法恢复！$\n$\n真的要删？（默认选「否」更安全）" \
      /SD IDNO IDYES unDoDelete IDNO unKeepData

  unDoDelete:
    ; ----- 双重防线：RMDir 前最后一次校验 data.db 或 .crystal-marker -----
    IfFileExists "$4\数据库\data.db" doRMDir 0
    IfFileExists "$4\data.db" doRMDir 0
    IfFileExists "$4\.crystal-marker" doRMDir 0
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "❌ 安全校验失败$\n$\n目录里没找到 data.db 或安装标记，已取消删除。$\n$\n（这是程序的安全机制，防止误删非本程序的文件夹）" \
      /SD IDOK
    Goto unCleanupTemp
  doRMDir:
    RMDir /r "$4"
    Delete "$APPDATA\crystal-price-system\user-data-path.json"
    Delete "$APPDATA\crystal-price-system\data-dir.txt"
    RMDir "$APPDATA\crystal-price-system"
    Goto unCleanupTemp

  unKeepData:
    ; ----- 保留数据：只告知，不打开文件夹 -----
    MessageBox MB_OK|MB_ICONINFORMATION \
      "✓ 数据已保留至：$4$\n$\n下次安装可继续用。" \
      /SD IDOK

  unCleanupTemp:
    RMDir /r "$TEMP\晶振备份"
!macroend
