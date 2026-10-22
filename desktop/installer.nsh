; NSIS does not consume electron-builder's generic protocols option.
!if "${APP_ID}" == "br.app.blueprint.room.production"
  !define BLUEPRINT_SCHEME "blueprint-room"
!else
  !define BLUEPRINT_SCHEME "blueprint-room-preview"
!endif
!macro customInstall
  WriteRegStr HKCU "Software\Classes\${BLUEPRINT_SCHEME}" "" "URL:Blueprint Room"
  WriteRegStr HKCU "Software\Classes\${BLUEPRINT_SCHEME}" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\${BLUEPRINT_SCHEME}\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
!macroend
!macro customUnInstall
  ReadRegStr $R0 HKCU "Software\Classes\${BLUEPRINT_SCHEME}\shell\open\command" ""
  StrCmp $R0 '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"' 0 +2
  DeleteRegKey HKCU "Software\Classes\${BLUEPRINT_SCHEME}"
!macroend
