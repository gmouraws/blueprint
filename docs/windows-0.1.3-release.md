# Blueprint Room 0.1.3 — unsigned Windows test release

Windows x64 client for https://www.blueprint.app.br. This is a manually updated, unsigned test installer; Windows may show an unknown-publisher warning. Browser access remains available. No server secrets are packaged.

Includes a scrollable screen/window picker with contained thumbnails, compact audio settings, account-saved custom shortcuts, tray controls, local mute confirmations and a saved screen-share-start notification preference. Closing hides to tray; use **Sair do aplicativo** to release media and exit. Startup never joins a room or activates capture.

Screen audio is optional **system audio**, including other applications and potentially received call audio. Application-only audio is deferred pending a separate native integration decision. No 60 fps, physical audio routing or game compatibility guarantee is made. Real multi-user acceptance is performed separately from automated checks.

Compare the installer SHA-256 with `SHA256SUMS-production.txt` before running. Keep the installer and checksum from the same release. Do not use a Preview installer for Production.
