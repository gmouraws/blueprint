# Blueprint Room 0.1.4 — unsigned Windows test release

Windows x64 client for https://www.blueprint.app.br. Manually updated, unsigned test installer; Windows may show an unknown-publisher warning. Exit Blueprint through **Sair do aplicativo** in the tray before installing. Browser access and the existing Production account/session profile are preserved.

The source picker now has search, a count, refresh and compact scrolling thumbnails. All sources returned by Electron are retained, including missing thumbnails. Windows can omit minimized/protected windows.

**Áudio do aplicativo · experimental** uses an original Windows process-loopback helper on build 20348 or later. It captures the selected window's owning process and children, which can include other windows/browser tabs of that application. It does not guess separately launched audio processes. The default is **Sem áudio**. Optional **Áudio do sistema** still includes unrelated applications and possibly call playback. No silent fallback, virtual driver, recording or service is used.

Real Windows tests used two independently playing tone applications, a child process, the sandboxed Electron bridge and a local LiveKit receiver. The selected process/child were received and unrelated/Electron playback tones were excluded. Automated tests also cover bounded buffers, cancellation and invalid grants. This does not verify your game, physical microphone/output devices, extended AV synchronization or a multi-user Production call. These remain manual acceptance checks.

Compare this installer with its accompanying SHA-256 file. To recover, exit and reinstall 0.1.3 from its immutable release; no database migration or account deletion is needed. This version preserves tray lifecycle, account shortcuts and notification preferences.
