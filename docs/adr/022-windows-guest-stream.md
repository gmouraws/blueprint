# ADR 022 — Windows guest transmission handoff

Status: Accepted by the owner for implementation and Production publication.

The installed Production client must open `/stream` without importing member credentials, capturing microphones, or replacing an authenticated call.

## Decision

Use a separate sandboxed BrowserWindow and in-memory session partition for guest transmission. The member window, persistent cookie store, tray audio controls and global shortcuts remain unchanged. Guest IPC is restricted to its exact top frame and `/stream` at the packaged HTTPS origin. Guest permissions deny microphone/camera; server LiveKit grants allow only screen sources and preserve watcher permissions.

The browser exchanges its existing guest session for a random, hashed, one-use 60-second handoff under the existing fenced Redis ledger. A strict profile-specific custom protocol carries only that short-lived fragment capability and an allowlisted intent. The executable never accepts arbitrary navigation URLs. It delivers the capability once through IPC after loading a clean URL. The original invitation role, expiry and revocation continue to apply. No database migration or additional service is needed.

Browser media is disconnected before opening the executable, preventing a normal handoff from using two admissions. Browser fallback remains explicit. Separate devices/tabs can still use separate admissions; all connections remain subject to the server's eight-person limit. Handoff failure never weakens authentication.

Guest screen capture requires an explicit click, connected share permission and a recent renderer heartbeat. Reuse the native picker and existing application/system/no-audio modes. Application audio remains experimental and opt-in; unsupported systems never silently fall back. Closing hides the guest window to the tray; explicit application exit destroys both windows and releases media. Opening a second invitation asks before replacing the guest window.

## Limits and recovery

Custom protocols require installation and browser/OS confirmation. Windows may retain short-lived protocol arguments; never pass member sessions or long-lived invite credentials through the generated handoff. Revocation/expiry timing retains ADR 021's provider-cleanup limitations. A revoked link cannot be renewed by desktop handoff.

Manual updates remain necessary. Retain 0.1.4 as installer recovery, and the previous web deployment as described in RELEASE.md. Reverting the web alone cannot update or remove installed clients. No real user audio/game compatibility is inferred from synthetic local transport tests.
