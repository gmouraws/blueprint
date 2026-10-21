# Blueprint Room: approved scope

The owner explicitly approved replacing the public engineering lab with one private browser-based voice and screen-sharing room at the root of blueprint.app.br. This is a product replacement, not an extra section. Preserve the repository, Git history, Vercel project and domain association.

- Exactly two voice rooms, Sala principal and Sala 2, with at most eight simultaneous voice participants combined. Server-side Redis admission and LiveKit Cloud revocation enforce capacity; browsers cannot choose arbitrary rooms.
- One shared channel with plain text, safe HTTP(S) links and private images, # geral, persisted in PostgreSQL for 30 days. Authenticated members can read and write without joining voice. Sala/Chat views preserve their existing media connections; switching never disconnects audio or resets local volumes.
- Invite-only email-code accounts with stable identity, editable display name, private avatar and owner-managed access. This feature is Preview-only pending separate Production approval.
- Optional remembered access: unchecked by default, with a 12-hour browser session or an opt-in 30-day persistent cookie. Returning users explicitly join with the microphone off. Leaving disconnects media; a separate entry-screen action forgets authentication. Session revocation and account disabling invalidate access.
- Microphone selection, mute, local incoming-audio mute, screen selection, screen sharing and fullscreen.
- Screen audio is requested but depends on browser, OS and capture source. No guaranteed resolution, frame rate or latency.
- Reconnection, device denial, canceled capture, unavailable services and full-room states must be understandable.
- UI exclusively pt-BR; Chrome/Edge on Windows are the primary target.
- Desktop sharing first, with accessible smaller-screen layouts.
- Owner-approved call improvements: optional silent microphone test, input/output selection where supported, per-participant and selected-screen playback volumes, optional membership tones, validated local preferences, and real SDK connection/quality feedback. These changes require Preview review before production release.
- No webcam, recordings, transcription, AI, analytics, advertisements, public registration, extra voice rooms beyond the two approved rooms, other file uploads, reactions, editing or read receipts.

Only the owner-approved implementation is authorized. Do not add professional content, external biographies or unrelated repository context. Preview review precedes any production replacement.

The Preview extension in ADR-013 adds compact collapsible room navigation, independent voice rooms, private JPEG/PNG/WebP attachments (5 MB each), and one stream mini-player while chatting. Browsing or collapsing a room never joins it. Switching rooms releases old capture and joins microphone-off while preserving chat. Screen quality is best effort; no sustained 60 fps claim is approved. Production remains unchanged until a separate approval.

ADR-014 extends browsing to authenticated screen-only viewing in either room without joining its voice call. Single click selects, double click joins; a header action supports touch/keyboard. Other-room screen audio is opt-in and independent of joined-room microphones. The combined voice limit remains eight.

The next Preview extension adds confirmed deletion of the authenticated sender's own messages/images, with text preserved when only an image is removed (ADR-015). Ownership follows the session UUID, not the nickname, and cannot be recovered across new sessions/devices. It also exposes a saved browser-native noise-suppression preference, a dark stream selector with visible selected-stream audio controls, and headphones-based global deafen that leaves the microphone unchanged. No paid audio processor or new provider is authorized.

Owner-approved visual membership notices accompany the existing voice lifecycle: arrivals/departures only in the joined voice room, also visible while reading chat. They remain visible with sounds disabled or global deafen. No notification is generated for initial participants, temporary reconnection, browsing, or other-room activity; chat-only users receive none. These are transient in-app notices, not browser push notifications or persistent chat records.

## Combined mute and browser shortcuts (Phase A, Preview)

Entry actions use "Entrar na sala"; chat-only entry uses "Abrir chat" without changing admission. Separate microphone and incoming-audio controls remain. "Silenciar tudo" snapshots their states and mutes both; restoration never creates a microphone track. An individual override exits combined mode and changes only that side, leaving the other muted. Room lifecycle changes discard restoration; device/track changes prevent microphone restoration. Browser shortcuts start unset, are local preferences, and work only while the application has focus, outside typing/IME/repeated-key events. No global shortcuts, Electron application or infrastructure is included.

## Separate guest transmission experiment

The owner approved an additional /stream experience for invitation-only guests without accounts or nicknames, preserving the member rooms. See ADR 021 and STREAM.md for its separate screen-only authorization, capacity, expiry and native limitations.
