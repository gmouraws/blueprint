# ADR 019: Account-authoritative shortcuts and desktop source selection

Status: approved for implementation and a minimal web Production release supporting private Windows testing. Desktop installer/public download remain private and unreleased.

The installed 0.1.1 Production shell contains its preload bridge, but the observed running window still displayed the old focus-only shortcut help and no desktop settings while the canonical deployment already contained the newer web bridge. An open hosted page does not update when the server deploys. Do not force-reload an active call. Detect missing integration and explain how to leave/reopen safely.

Shortcut bindings are authoritative in the existing `blueprint_user.preferences` JSONB column, in separate `browser` and `windowsDesktop` keys. No schema migration or data backfill is necessary. Legacy OS keys remain intact and are a read fallback until that platform is explicitly saved. Local overrides never shadow the account; an explicit import action can copy them to the current platform. Audio devices remain local and live mute state is never persisted.

The authenticated, origin-checked, rate-limited account API performs versioned partial JSONB updates, preserving other platforms/settings. The caller-supplied expected account ID only fences an account-switch race; the session determines the SQL owner. Recorder save waits for success, reports failure, and updates all mounted controls immediately. Logout clears cached bindings/native registration. Existing defaults editors receive the updated version and retain conflict detection.

Native tray/shortcut actions reuse the renderer audio dispatcher. SDK state is sent on changes and a heartbeat; stale state disables actions. Typing exclusions apply to keyboard dispatch, not explicit tray clicks. Recording suspends both. The tray explains disconnected/uninitialized state. No media starts on startup or reconnection.

Source selection uses a sandboxed, isolated local modal with screen/window thumbnails, explicit selection and opt-in system audio. Only its exact main frame can list/choose/cancel a pending request. Main re-enumerates the selected ID before granting capture. Navigation, cancellation, renderer failure and a deadline resolve the request and release the modal/thumbnails. System loopback includes other applications; no tab-only or per-window audio promise is made. No thumbnails or window titles leave the process or enter logs.

Immediate web rollback target: `c6fc03ae4b3f5a145677500ec88742ef2b6e1542`, READY Production deployment `dpl_5292rTUFhqAXdNdG5hxynPYCCJrW`. Prefer a forward fix after new platform bindings are saved: the older reader does not understand those keys and may show defaults. Never delete/rewrite the new keys to roll back. No authentication/database migration is part of this release; accounts, messages and retention are preserved.

Report mocked lifecycle/source-selection tests, real database-compatible tests, actual Windows OS dispatch, and physical media tests separately. A successful build or IPC test is not evidence of audible microphone/system audio or game compatibility.
