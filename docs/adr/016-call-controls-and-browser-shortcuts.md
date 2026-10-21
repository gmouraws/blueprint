# ADR 016: Shared call actions and local browser shortcuts

Status: accepted for Phase A Preview; no Production authorization.

## Decision

Keep one transient audio controller per Room, shared by footer/viewer buttons and the focused browser keyboard listener. Microphone state remains authoritative in LiveKit; incoming mute continues to use the existing playback and notification policy. Combined mute stores the preceding microphone/incoming states, cancels pending activation and mutes both. An individual override discards the snapshot, changes only that side and leaves the other muted. Failures remain visible and do not assert that both sides were muted.

Restoration can only enable the same live microphone track and selected input in the same connected call. Disconnection/reconnection invalidates the snapshot. Device/track replacement prevents microphone restoration. LiveKit's audio-specific unmute can reacquire capture after a deferred device change; the restoration path therefore uses the exported LocalTrack base unmute operation (state/signalling only), with live-track guards. Explicit microphone activation retains normal SDK acquisition/unmute. No persisted preference, reconnection or restoration creates a microphone capture.

Optional bindings extend the existing validated local preferences. They start empty; the initial editor accepts Ctrl+Shift+letter combinations and rejects duplicates and known reserved combinations. Browser/OS interception cannot be exhaustively detected, so settings explain the limit and provide clear/reset. One keydown listener ignores default-prevented events, unfocused documents, editable/typing targets, shortcut recording, IME/AltGr and repeats. No global hotkey, account, package, service or desktop shell is introduced.

## Validation and limits

Unit state-transition tests cover all four initial combinations, overrides, invalidation, stale operations and failures. Browser tests cover configuration persistence, input exclusions, accessibility and touch image deletion; local LiveKit tests check capture count, actual published mute and incoming renderers. Physical audibility, hardware routing and hosted multi-user behavior remain separate manual acceptance checks.
