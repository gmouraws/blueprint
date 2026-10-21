# ADR 018: Windows test shell and custom shortcuts

Status: approved for isolated feature implementation and Preview; no installer publication or Production deployment authorization.

PR #15 is merged at b0477d7; real OTP and the Production owner session were verified. The desktop branch starts from main and does not change account authentication.

Use a separately packaged Electron shell with an exact packaged HTTPS origin, persistent profile-specific userData/session storage, sandbox, context isolation, no Node in remote content, and a small validated preload bridge. Preview and Production builds have distinct names, app IDs, cookie stores and startup entries. The hosted Next.js backend remains authoritative; no server code, credentials or browser cookie import is packaged.

One existing audio dispatcher handles UI, browser keys, native shortcuts and tray actions. Native dispatch is registered only while an authenticated call is available; the renderer checks availability again. Recording suspends native registration. A focused typing/editor target ignores actions. Browser dispatch is disabled whenever the native bridge exists. Native registration conflicts are reported; rapid repeated callbacks are suppressed. Reserved OS combinations and exclusive games cannot be guaranteed.

Custom canonical key strings extend, rather than replace, stored Ctrl+Shift bindings. Device overrides remain scoped by account and platform in that browser/profile, preceding account defaults. Live media state is never saved. Recorder requires explicit Save and rejects duplicates/modifier-only/reserved combinations.

Close hides to tray with a first-close explanation; minimize preserves media. Explicit Exit destroys the renderer/capture and unregisters global keys. Single-instance lock restores the existing window. Optional packaged Windows startup is off unless explicitly enabled; loading the entry page never joins or captures. Manual updates only.

Screen capture uses Electron's source selection callback with a native explicit source dialog. Windows system loopback audio is opt-in and may include other applications. Microphone permission is separately confirmed, no camera permission, and unrelated origins are denied. Real hardware, output routing, shared audio and revocation still require Windows acceptance.

The download manifest stays null until a production-targeted installer is verified, approved and published with SHA-256 at a stable GitHub release asset URL. Draft release/CI/local paths are not web downloads. Installer builds and checksums are test artifacts, not evidence of media correctness.
