# Windows test application

Version 0.1.5 adds a separate guest transmission window and validated invitation handoff (ADR 022). Install the Production x64 test client, open a valid HTTPS invitation, and choose **Abrir no aplicativo**. Browser continuation remains available. No account/nickname is required in this window and microphone permission is always denied. **Selecionar tela** is still an explicit action. Close hides the window; the tray restores it; **Sair do aplicativo** stops all media. Member sessions and voice rooms retain their separate persistent cookie store.


Version 0.1.4 adds searchable/refreshed capture sources and experimental application-only audio (ADR 020). The owner subsequently authorized Production publication for manual acceptance. No hosted media integration change is needed; switch the download only after the published asset is verified. See WINDOWS-APPLICATION-AUDIO.md for runtime requirements and measured versus manual verification.

## Build and profiles

Accounts dependency: PR #15 merged in main (b0477d7), OTP verified; no pending Resend dependency. This branch does not alter or merge that work.

Run `npm ci` at the repository root, `npm ci --prefix desktop`, then `npm run build --prefix desktop` on Windows x64. The default installer is Preview-only. `npm run build --prefix desktop -- --production` deliberately produces a different profile/installer, but does not publish it. Never put a Preview binary on the Production download.

For an unambiguous Production build in PowerShell, run `node build.mjs --production` from `desktop`; inspect the packaged `profile.json` before distribution. Version 0.1.1 is authorized for private testing against the canonical Production application only. PR #17 isolates the web bridge/recorder from the desktop PR; it adds no public download or database changes.

Startup failures (network, timeout, renderer, preload, blocked redirect) replace the failed page with a script-free recovery screen. Retry can load only the packaged origin. Diagnostics show the profile/version, an allowlisted category and optional numeric Chromium error code; no exception text, request URLs or credentials are persisted. A failed renderer clears native actions. A successful page load does not prove authentication or media readiness.

The Production 0.1.1 packaged executable opened the real HTTPS entry page in an automated Windows smoke test with the preload bridge present, sandbox/context isolation enabled and Node integration disabled. An injected DNS failure displayed recovery and Retry returned to the entry page. This did not install through NSIS, authenticate, or test physical devices/global keys. The earlier blank-window cause was not reproduced and remains unconfirmed.

Electron and electron-builder are build-only dependencies in their own lockfile. Only the explicit shell files are packaged; no Next.js server, environment files or production dependencies. The existing SVG is rasterized into PNG/ICO during build. `desktop/dist/SHA256SUMS-preview.txt` accompanies the unsigned NSIS installer. `desktop/dist` and generated assets are ignored by Git. Windows PR CI builds review artifacts. The separate, owner-authorized 0.1.3 release workflow publishes only after Quality passes on main; it does not deploy Vercel.

## Security and lifecycle

Version 0.1.2 adds account-authoritative browser/Windows bindings, call-state heartbeat, incompatible-page feedback, and a local thumbnail screen picker. See ADR 019 for reconciliation, permissions and rollback. Close/reopen after leaving an old loaded page to receive new web code; do not refresh an active call automatically.

Exact packaged origin allowlist, no Node integration, context isolation/sandbox, validated top-frame IPC, denied webviews/navigation and HTTP(S)-only external browser links. Cookies use the application's separate persistent partition; remembered login retains the server's 30-day limit, unchecked login retains its browser-session/12-hour limit. No credentials are copied or stored in preferences.

Close/minimize preserve calls. The tray restores the window, mirrors actual call state and offers explicit Exit. Exit destroys renderer media and unregisters shortcuts; abnormal process termination also releases Chromium capture. Server admission/lease cleanup remains governed by existing revocation/reconciliation. Startup is optional, off by default, and cannot join or capture. No auto-updates or signing purchase.

Screen selection is explicit. Optional Windows loopback can include audio from other applications; it is unchecked by default. Microphone and display permissions are distinct, so listening never requires mic permission. Output selection reuses LiveKit/browser support, not an assumed guarantee.

## Publication gate

The owner authorized publishing the completed 0.1.3 Windows test release and enabling its download. This supersedes the earlier private/manual-acceptance gate. `.github/workflows/windows-release.yml` is restricted to the successful main Quality push and specifically version 0.1.3; it never replaces existing assets. Future versions require another reviewed release decision. The normal Vercel Git integration deploys the web commit independently.

Keep `src/lib/windows-release.ts` null until the actual production-profile installer and checksum have been published and downloaded/hash-verified. Then enable the exact stable assets in a small reviewed manifest change. Never expose draft/expiring CI artifacts or a Preview build. Physical Windows/multi-user acceptance remains explicitly unverified unless recorded. See WINDOWS-APPLICATION-AUDIO.md for the deferred process-audio proposal.

Version 0.1.3 fixes picker row compression with fixed-ratio thumbnail frames, separate name rows and a scrolling grid. Settings have one bounded scroller with inline shortcut editing. Screen-start notifications observe the joined room's screen publisher metadata (not the browsed room), snapshot on connection/reconnection, and coalesce immediate 500 ms unpublish/republish replacements. Screen notifications respect deafen and their local/account-isolated saved preference. Short explicit-action confirmations use the same audio context/output but remain audible while deafened; they can be disabled separately. Neither notification starts media capture or opens a stream.

## Acceptance (must record actual results)

- Install/uninstall x64, app icon/name, unsigned-test warning, independent Preview/Production profiles; no browser cookie import.
- Real OTP, opt-in persistence after full exit, session-only expiration, forget/revoke; no automatic voice/capture at startup.
- Browser/desktop voice/chat/image/avatar interoperability and device choices; physical microphone/output routing.
- Record/save/cancel/remove/reset, duplicate/reserved bindings, old saved bindings, per-account isolation/default precedence.
- Global microphone/deafen/combined toggles while another app is focused, minimized and in tray; registration collision; no double toggle or disconnected capture. Games/fullscreen exclusive modes are a separate test.
- Close-to-tray explanation, restore, second launch, optional startup enabled/disabled; Exit removes process, microphone and screen indicators.
- Source selection/cancel, screen video/system audio opt-in and graceful denial; room switching, account revocation and explicit exit release all media.

Automated policy/build/browser checks do not prove real device audibility, global OS key delivery, tray interaction or installer operation. Report those separately.

## 0.1.6 handoff diagnostics

NSIS registers the profile-specific protocol explicitly; packaged startup verifies it. `handoff-status.json` in the application profile contains at most 64 fixed stage names and timestamps, with version/profile only. It never records link arguments, tickets, invitations, cookies, credentials or exception messages. Stages distinguish protocol registration, cold/second-instance acceptance, guest page loading, ticket redemption and media connection. Missing stages do not prove an application is absent. Browser launch attempts are not confirmations of successful opening.

The Production profile uses `blueprint-room`, Preview uses `blueprint-room-preview`. Each protocol command quotes the executable and URL argument. Exit marks shutdown before disposing windows and tray, making late callbacks harmless; it does not merely catch the tray exception.
