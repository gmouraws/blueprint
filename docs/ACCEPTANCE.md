# Manual acceptance before production

Automated tests do not establish real-device, multi-network or provider-quota behavior. Record actual results below or in the PR; do not mark unchecked scenarios passed.

- [ ] Configure a free LiveKit project and free Upstash database; preview displays an enabled form. Wrong password fails; no token without a valid cookie.
- [ ] Five friends on different computers/networks join the same fixed room using Chrome/Edge on Windows. Names, mic state and speaking labels are accurate. Check identical nicknames are still separate identities.
- [ ] Connect four clients, then race two independent browsers for the fifth slot. Exactly one joins. Retry a sixth after the room is full; rejection is clear. Inspect Cloud room cap=5.
- [ ] Let everyone leave, allow automatic room deletion, then race joins again. Also obtain a token, let the empty room expire and join with a fresh valid token: recreated room remains capped at five. Never disable the server cap.
- [ ] Enable/disable microphone and select another input device. Deny permission once, recover through browser permission settings. Verify mute does not stop screen audio/video.
- [ ] Silenciar áudio mutes all incoming mic/screen audio only on that client. Other participants keep hearing. No local microphone/shared-audio echo. Test autoplay unblock button.
- [ ] Share tab, window and screen from the native picker. Share from two people and switch selected view; fullscreen works. No webcam permission is requested.
- [ ] With a source/browser that offers audio, select its audio checkbox and verify remote sound. Test a source without audio and confirm the guidance is accurate; do not claim all games/windows are supported.
- [ ] Cancel the picker; the voice call remains connected. Stop sharing through the browser's stop button and confirm UI/video/audio update. Leave while a capture prompt is open; after cancel/selection, no devices remain active.
- [ ] Send Portuguese text and markup-like text; it renders literally, with correct sender/time. Reject an oversized UTF-8 message; disconnect during sending and check honest feedback. A late joiner sees no earlier messages. Refresh clears local chat.
- [ ] Interrupt networking briefly, restore it and observe reconnecting/connected. Test longer failure, server removal and fresh entry after session expiry. Do not promise uninterrupted delivery.
- [ ] Sair da sala, refresh, close tab: microphone and capture indicators stop. Cookie is cleared on normal logout. Re-enter using the remembered nickname; password is never locally stored.
- [ ] Cross-origin login/token requests fail. Redis outage/timeout and quota exhaustion fail closed. Verify secret values absent from browser assets/network responses (except intended participant token).
- [ ] Review keyboard focus, form errors, screen-reader labels, 320px reflow and long nicknames/messages. Validate actual media controls with assistive tech as needed.
- [ ] Preview shows no analytics, sitemap or old site pages; robots and response headers prohibit indexing. Only after owner approval, configure Production and merge.
