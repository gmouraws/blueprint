# Windows test application

## Build and profiles

Accounts dependency: PR #15 merged in main (b0477d7), OTP verified; no pending Resend dependency. This branch does not alter or merge that work.

Run `npm ci` at the repository root, `npm ci --prefix desktop`, then `npm run build --prefix desktop` on Windows x64. The default installer is Preview-only. `npm run build --prefix desktop -- --production` deliberately produces a different profile/installer, but does not publish it. Never put a Preview binary on the Production download.

For an unambiguous Production build in PowerShell, run `node build.mjs --production` from `desktop`; inspect the packaged `profile.json` before distribution. Version 0.1.1 is authorized for private testing against the canonical Production application only. PR #17 isolates the web bridge/recorder from the desktop PR; it adds no public download or database changes.

Startup failures (network, timeout, renderer, preload, blocked redirect) replace the failed page with a script-free recovery screen. Retry can load only the packaged origin. Diagnostics show the profile/version, an allowlisted category and optional numeric Chromium error code; no exception text, request URLs or credentials are persisted. A failed renderer clears native actions. A successful page load does not prove authentication or media readiness.

The Production 0.1.1 packaged executable opened the real HTTPS entry page in an automated Windows smoke test with the preload bridge present, sandbox/context isolation enabled and Node integration disabled. An injected DNS failure displayed recovery and Retry returned to the entry page. This did not install through NSIS, authenticate, or test physical devices/global keys. The earlier blank-window cause was not reproduced and remains unconfirmed.

Electron and electron-builder are build-only dependencies in their own lockfile. Only the explicit shell files are packaged; no Next.js server, environment files or production dependencies. The existing SVG is rasterized into PNG/ICO during build. `desktop/dist/SHA256SUMS-preview.txt` accompanies the unsigned NSIS installer. `desktop/dist` and generated assets are ignored by Git. Windows CI builds/uploads review artifacts without publishing releases or deploying Vercel.

## Security and lifecycle

Version 0.1.2 adds account-authoritative browser/Windows bindings, call-state heartbeat, incompatible-page feedback, and a local thumbnail screen picker. See ADR 019 for reconciliation, permissions and rollback. Close/reopen after leaving an old loaded page to receive new web code; do not refresh an active call automatically.

Exact packaged origin allowlist, no Node integration, context isolation/sandbox, validated top-frame IPC, denied webviews/navigation and HTTP(S)-only external browser links. Cookies use the application's separate persistent partition; remembered login retains the server's 30-day limit, unchecked login retains its browser-session/12-hour limit. No credentials are copied or stored in preferences.

Close/minimize preserve calls. The tray restores the window, mirrors actual call state and offers explicit Exit. Exit destroys renderer media and unregisters shortcuts; abnormal process termination also releases Chromium capture. Server admission/lease cleanup remains governed by existing revocation/reconciliation. Startup is optional, off by default, and cannot join or capture. No auto-updates or signing purchase.

Screen selection is explicit. Optional Windows loopback can include audio from other applications; it is unchecked by default. Microphone and display permissions are distinct, so listening never requires mic permission. Output selection reuses LiveKit/browser support, not an assumed guarantee.

## Publication gate

Keep `src/lib/windows-release.ts` null. After real Windows acceptance and owner approval, create a production-profile build, verify its hash/profile, upload installer plus SHA256SUMS-production.txt to a reviewed release in gmouraws/blueprint, and publish only when authorized. Then fill the approved production manifest with version, exact stable HTTPS assets and hash in a separate reviewed change. Draft/expiring CI assets are never exposed by the UI. A draft prerelease may hold review notes without exposing a live download.

## Acceptance (must record actual results)

- Install/uninstall x64, app icon/name, unsigned-test warning, independent Preview/Production profiles; no browser cookie import.
- Real OTP, opt-in persistence after full exit, session-only expiration, forget/revoke; no automatic voice/capture at startup.
- Browser/desktop voice/chat/image/avatar interoperability and device choices; physical microphone/output routing.
- Record/save/cancel/remove/reset, duplicate/reserved bindings, old saved bindings, per-account isolation/default precedence.
- Global microphone/deafen/combined toggles while another app is focused, minimized and in tray; registration collision; no double toggle or disconnected capture. Games/fullscreen exclusive modes are a separate test.
- Close-to-tray explanation, restore, second launch, optional startup enabled/disabled; Exit removes process, microphone and screen indicators.
- Source selection/cancel, screen video/system audio opt-in and graceful denial; room switching, account revocation and explicit exit release all media.

Automated policy/build/browser checks do not prove real device audibility, global OS key delivery, tray interaction or installer operation. Report those separately.
