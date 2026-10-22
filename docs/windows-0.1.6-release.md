# Blueprint Room 0.1.6 — unsigned Windows x64 test release

Production: https://www.blueprint.app.br. Manual update required for the Windows handoff/exit fixes. No secrets embedded.

- NSIS explicitly registers the profile-specific URL protocol with the quoted installed executable path. Packaged startup verifies/repairs the association.
- Cold-start and second-instance handoff retain share/watch intent and a separate guest window; explicit screen selection remains mandatory.
- Safe bounded local stage diagnostics in the profile's handoff-status.json contain no URLs, tickets, invitations or credentials.
- Exit fences tray updates before disposing guest/main media, picker IPC, timers and shortcuts. Cleanup is idempotent.
- Browser fallback remains available. Requesting a protocol launch does not prove Windows accepted it.

Verify SHA256SUMS-production.txt before installation. Physical microphone, games and multi-user acceptance are separate from automated checks. Recovery: manually reinstall 0.1.5 and restore its download manifest; keep accounts, profile and chat data. The old version retains the reported handoff/shutdown defects.
