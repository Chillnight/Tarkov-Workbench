; Author: CA
!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh

!ifndef BUILD_UNINSTALLER
Var WorkbenchDesktopChoice
Var WorkbenchDesktopCheckbox
!endif

!macro WorkbenchCheck mode
  InitPluginsDir
  File /oname=$PLUGINSDIR\workbench-install-check.ps1 "${PROJECT_DIR}\desktop\installer-check.ps1"
  nsExec::ExecToStack /TIMEOUT=15000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\workbench-install-check.ps1" -Mode ${mode} -InstallDirectory "$INSTDIR"'
  Pop $R8
  Pop $R9
!macroend

; Only the selected app executable can block setup. Never stop another portable
; copy, this installer, the uninstaller, or an unrelated process in the folder.
!macro customCheckAppRunning
  ${Do}
    !insertmacro WorkbenchCheck Processes
    ${If} $R8 == 0
      ${ExitDo}
    ${EndIf}
    SetErrorLevel 3
    ${If} $R8 == 10
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Tarkov Workbench is still running from:$\r$\n$INSTDIR$\r$\n$\r$\nClose that copy of the app, then select Retry. Other portable copies can remain open." /SD IDCANCEL IDRETRY +2
      Quit
    ${Else}
      MessageBox MB_OK|MB_ICONSTOP "Setup could not check whether Tarkov Workbench is running. No app files have been replaced. Close running Workbench copies and try again.$\r$\n$\r$\n$R9" /SD IDOK
      Quit
    ${EndIf}
  ${Loop}
  SetErrorLevel 0
!macroend

!macro customInit
  StrCpy $WorkbenchDesktopChoice ${BST_UNCHECKED}
  ReadRegDWORD $WorkbenchDesktopChoice SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" DesktopShortcut
  ${If} ${Silent}
    Call WorkbenchValidateDirectory
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom WorkbenchOptionsPage WorkbenchOptionsLeave
!macroend

!macro customHeader
!ifndef BUILD_UNINSTALLER
Function WorkbenchValidateDirectory
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "${APP_FILENAME}"
    StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
  ${EndIf}
  ${GetRoot} "$INSTDIR" $0
  ${If} $INSTDIR == "$0\"
  ${OrIf} $INSTDIR == "$0"
    MessageBox MB_OK|MB_ICONSTOP "Choose a dedicated Tarkov Workbench folder, not a drive root." /SD IDOK
    SetErrorLevel 3
    Abort
  ${EndIf}
  IfFileExists "$INSTDIR\*.*" 0 directory_ok
  IfFileExists "$INSTDIR\resources\installation.json" 0 directory_not_owned
  IfFileExists "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe" directory_ok directory_not_owned
  directory_not_owned:
    FindFirst $0 $1 "$INSTDIR\*.*"
    directory_loop:
      StrCmp $1 "" directory_empty
      StrCmp $1 "." directory_next
      StrCmp $1 ".." directory_next
      FindClose $0
      MessageBox MB_OK|MB_ICONSTOP "This folder already contains other files. Choose an empty folder or the existing Tarkov Workbench installation. Keep portable copies in a separate folder." /SD IDOK
      SetErrorLevel 3
      Abort
    directory_next:
      FindNext $0 $1
      Goto directory_loop
    directory_empty:
      FindClose $0
  directory_ok:
  !insertmacro WorkbenchCheck Writable
  ${If} $R8 != 0
    MessageBox MB_OK|MB_ICONSTOP "Setup cannot write to the selected folder.$\r$\n$\r$\nFor Program Files or another protected location, go Back and choose 'Anyone who uses this computer' to request administrator access. For 'Only for me', choose a folder in your user profile or another writable location.$\r$\n$\r$\nNo app files have been replaced." /SD IDOK
    SetErrorLevel 3
    Abort
  ${EndIf}
FunctionEnd

Function WorkbenchOptionsPage
  !insertmacro MUI_HEADER_TEXT "Installation options" "Choose your shortcut preference."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 28u "A Start menu shortcut and a Windows uninstaller are included. System-wide installations require administrator access."
  Pop $0
  ${NSD_CreateCheckbox} 0 40u 100% 16u "Create a desktop shortcut"
  Pop $WorkbenchDesktopCheckbox
  ${NSD_SetState} $WorkbenchDesktopCheckbox $WorkbenchDesktopChoice
  ${NSD_CreateLabel} 0 72u 100% 44u "The app asks before downloading game data and images on first launch. Existing settings and downloaded data in your user profile are kept during updates and uninstallation."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function WorkbenchOptionsLeave
  Call WorkbenchValidateDirectory
  ${NSD_GetState} $WorkbenchDesktopCheckbox $WorkbenchDesktopChoice
FunctionEnd
!endif
!macroend

!macro customInstall
  ${If} $WorkbenchDesktopChoice != ${BST_CHECKED}
    Delete "$newDesktopLink"
  ${EndIf}
  WriteRegDWORD SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" DesktopShortcut $WorkbenchDesktopChoice
  !searchreplace WORKBENCH_DISPLAY_VERSION "${VERSION}" "-" "."
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayVersion "${WORKBENCH_DISPLAY_VERSION}"
!macroend
