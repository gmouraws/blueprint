# Manual acceptance before production

Automated tests do not establish real-device, multi-network or provider-quota behavior. Record actual results below or in the PR; do not mark unchecked scenarios passed.

- [ ] Configure a free LiveKit project and free Upstash database; preview displays an enabled form. Wrong password fails; no token without a valid cookie.
- [ ] Confirm the Preview commit and deployment are newer than the variable changes. Invalid setup keeps entry disabled; expanded diagnostics show only variable names and safe categories. Correct the listed variables in Preview, redeploy, and use the new Preview URL.
- [ ] Eight friends on different computers/networks join the same fixed room using Chrome/Edge on Windows. Names, mic state and speaking labels are accurate. Check identical nicknames are still separate identities.
- [ ] Connect seven clients, then race two independent browsers for the eighth slot. Exactly one joins. Retry a ninth after the room is full; rejection is clear. Inspect Cloud room cap=8.
- [ ] Let everyone leave, allow automatic room deletion, then race joins again. Also obtain a token, let the empty room expire and join with a fresh valid token: recreated room remains capped at eight. Never disable the server cap.
- [ ] Enable/disable microphone and select another input device. Deny permission once, recover through browser permission settings. Verify mute does not stop screen audio/video.
- [ ] Silenciar áudio mutes all incoming mic/screen audio only on that client. Other participants keep hearing. No local microphone/shared-audio echo. Test autoplay unblock button.
- [ ] Share tab, window and screen from the native picker. Share from two people and switch selected view; fullscreen works. No webcam permission is requested.
- [ ] With a source/browser that offers audio, select its audio checkbox and verify remote sound. Test a source without audio and confirm the guidance is accurate; do not claim all games/windows are supported.
- [ ] Cancel the picker; the voice call remains connected. Stop sharing through the browser's stop button and confirm UI/video/audio update. Leave while a capture prompt is open; after cancel/selection, no devices remain active.
- [ ] Send Portuguese text and markup-like text; it renders literally, with correct sender/time. Reject an oversized UTF-8 message; disconnect during sending and check honest feedback. A late joiner sees the shared retained history. Reload preserves messages. Open Chat without voice, test pagination and retry a response lost after saving; no duplicate should appear.
- [ ] Switch Sala/Chat repeatedly with active voice and screen sharing: no disconnect, capture interruption or volume reset. Check unread count, keyboard tabs and the composer at mobile widths.
- [ ] Verify environment isolation, rejected unauthorized chat reads/writes, expiry filtering, Preview manual cleanup and eventual Production cron execution after release.
- [ ] Interrupt networking briefly, restore it and observe reconnecting/connected. Test longer failure, server removal and fresh entry after session expiry. Do not promise uninterrupted delivery.
- [ ] Sair da sala, refresh, close tab: microphone and capture indicators stop. Leaving preserves login; re-entry always needs an explicit click and starts microphone-off. Confirm no password or auth token in localStorage/sessionStorage.
- [ ] "Manter conectado neste dispositivo" starts unchecked. Unchecked login sets a browser-session cookie and expires server-side after 12 hours; checked login survives browser restart for up to 30 days. Confirm expiration and password rotation require password entry again, including a page left open before expiration. Browser restore behavior cannot extend the server deadline.
- [ ] From the entry screen, "Esquecer acesso neste dispositivo" clears authentication; reload requires the password and /api/token rejects access. Offline failure gives honest feedback. Verify browser password-manager save/fill with the username/current-password fields; no automatic microphone capture on return.
- [ ] Cross-origin login/token requests fail. Redis outage/timeout and quota exhaustion fail closed. Verify secret values absent from browser assets/network responses (except intended participant token).
- [ ] Review keyboard focus, form errors, screen-reader labels, 320px reflow and long nicknames/messages. Validate actual media controls with assistive tech as needed.
- [ ] Preview shows no analytics, sitemap or old site pages; robots and response headers prohibit indexing. Only after owner approval, configure Production and merge.

## Two-room/image Preview acceptance

- Expand/collapse both room sections and browse either room: the current call must remain connected.
- Switch rooms repeatedly while sharing. Previous capture/audio must stop, the destination microphone stays off, and chat/drafts remain intact. Across both rooms the ninth voice participant must be refused.
- Confirm red crossed-out microphones reflect sender mute; listener mute is separately labeled and changes only local playback. Open/close participant options by keyboard.
- Confirm one local join/switch/leave tone, remote tones only for the current room, no initial-snapshot/reconnect duplicates, and preference/global-mute suppression.
- Confirm visual entry/exit notices name only participants in your joined voice room, also while viewing Chat. Notices remain with tones disabled/deafen; keyboard dismissal and automatic expiry work. Chat-only browsing and other-room activity produce none, and temporary reconnection does not announce false departures/arrivals.
- Send JPEG/PNG/WebP by paste, file picker and drop; remove the preview, retry failures, reload and enlarge the image. Reject malformed/oversized/unauthorized/expired uploads or retrieval. Confirm links open safely and other content remains plain text.
- Watch a moving stream while chatting. Hide/restore/expand the mini-player without duplicate audio or a second connection. Switching voice rooms clears the previous stream. Check measured quality; do not infer 60 fps from the requested preset.

## Cross-room viewing Preview acceptance

- Reload/rejoin the current Preview on all test clients; older clients publish into the previous screen transport.
- With a presenter and active microphone in each room, single-click either room and watch its screen while your original voice call remains unchanged. Double-click and the selected-room header join button must switch safely, microphone-off. Collapse/expand must do neither.
- Open chat without voice, then select either room with the keyboard. Watch without microphone capture or appearing in the voice roster.
- Other-room screen audio starts off. Explicit listening enables only that screen; global mute and output selection still govern all playback, while participant and screen volumes remain independent.
- Repeatedly select rooms, switch voice, hide/restore the mini-player, stop a stream and interrupt/recover networking. Check no duplicate sound, microphone leakage, stale player or lingering observer.
- Fill the combined eight voice slots while viewers are present; reject the ninth voice admission. Confirm Cloud revokes both publisher identities when switching/leaving, including absent pending tokens.

## Deletion and audio controls (Preview only)

- In two chat-only clients, remove your image while retaining its text, then remove the whole message. Confirm Cancel leaves it unchanged, other senders have no action, the other client reconciles within a polling interval and the attachment URL returns 404. Repeat after reload, with older paginated history and after an interrupted acknowledgement. A new identity with the same nickname must not own earlier messages.
- Exercise a Blob cleanup failure privately; access must stay revoked and a later maintenance run must delete both objects and retained cleanup metadata. Preview maintenance remains manual, including the upload-token grace window.
- Toggle native noise suppression on a physical microphone, change devices, reconnect and compare speech/noise. Confirm the preference persists and the reported setting matches the browser; unsupported/unreported processing must remain honestly labeled. Screen audio must remain unchanged.
- Use the dark stream selector by keyboard and touch, with long names and presenters stopping. Check one selected audio path and visible volume controls at desktop/mobile widths.
- Deafen with microphones, a selected screen and tones active. Start/replace tracks while deafened; all must remain silent. Restore audio and confirm earlier individual mute/volume settings and local microphone state are preserved. Verify both joined and view-only screen connections and the other-room opt-in.
