# Blueprint Room: approved scope

The owner explicitly approved replacing the public engineering lab with one private browser-based voice and screen-sharing room at the root of blueprint.app.br. This is a product replacement, not an extra section. Preserve the repository, Git history, Vercel project and domain association.

- One fixed room, at most eight participants, enforced by LiveKit's server configuration.
- One ephemeral plain-text chat channel. No replay for late joiners and no persistence.
- Shared password, server-generated identity, nickname chosen at password login and fixed for that authenticated session.
- Optional remembered access: unchecked by default, with a 12-hour browser session or an opt-in 30-day persistent cookie. Returning users explicitly join with the microphone off. Leaving disconnects media; a separate entry-screen action forgets authentication. Password rotation invalidates old sessions.
- Microphone selection, mute, local incoming-audio mute, screen selection, screen sharing and fullscreen.
- Screen audio is requested but depends on browser, OS and capture source. No guaranteed resolution, frame rate or latency.
- Reconnection, device denial, canceled capture, unavailable services and full-room states must be understandable.
- UI exclusively pt-BR; Chrome/Edge on Windows are the primary target.
- Desktop sharing first, with accessible smaller-screen layouts.
- Owner-approved call improvements: optional silent microphone test, input/output selection where supported, per-participant and selected-screen playback volumes, optional membership tones, validated local preferences, and real SDK connection/quality feedback. These changes require Preview review before production release.
- No webcam, recordings, transcription, AI, analytics, advertisements, accounts database or chat history.

Only the owner-approved implementation is authorized. Do not add professional content, external biographies or unrelated repository context. Preview review precedes any production replacement.
