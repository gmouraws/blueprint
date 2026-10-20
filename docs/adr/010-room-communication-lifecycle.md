# ADR-010: Explicit media ownership and session-local playback

**Status:** Implemented for Preview review; not authorized for production release.

## Context

Real users reported unreliable remote audio, slow microphone activation and failed chat sends. The original device hook received a new error callback on every render, repeatedly resetting its observable device list. A local baseline measured 27,630 enumerations during approximately 8.6 seconds. The chat also recreated its data handler on each render. A two-browser baseline reproduced its generic send failure; the exact original exception was not captured. Token grants and the presence of the original audio renderer were already correct.

## Decision

- Create one Room during the entry gesture and invoke the official `startAudio` API before authentication awaits. Capture remains off. Render playback recovery from LiveKit's actual playback state.
- Use the standard LiveKit audio-element playback path. One `AudioTrack` owns each remote microphone; only the selected remote screen has an audio renderer. Local tracks never have an audio renderer. Volumes are listener-local, with global mute taking precedence.
- Enumerate devices with a stable subscription. Permission changes, publication, focus and `devicechange` refresh the list. Output switching uses `Room.switchActiveDevice` where `setSinkId` is supported. A disconnected selection falls back once to the system default, with a visible failure if that attempt fails. Listening never requests a microphone.
- Keep an activated microphone track reserved while muted, avoiding repeated capture/device negotiation. Explicit cancellation and room teardown stop pending/late captures. Explain the reserved capture in settings. The optional prejoin test owns and disposes its own silent analyser graph.
- Publish chat through `localParticipant.publishData` and a stable `RoomEvent.DataReceived` subscription. A single-flight guard covers button and keyboard submission. Failed sends preserve the draft and do not assert delivery. Server authentication and the plain UTF-8 payload format are unchanged.
- Remember only validated nickname, microphone selection, notification preference and screen volume. Per-participant volume uses the authenticated session identity and remains in memory; a nickname is not a durable identity.
- Membership tones use an original short oscillator sound. Initial snapshots, reconnections and track changes are not arrivals. Global mute and the sound preference suppress tones. Optional tones are disabled if they cannot follow a non-default call output.

## Consequences

Microphone privacy indicators can remain active while muted because capture is retained; leaving releases it. Chrome/Edge desktop remain the supported target. Native output selection, mobile volume control and capture-source audio vary by browser/OS and need real-device acceptance. No new production service, dependency, credential, room, recording or chat persistence is introduced. The participant limit remains eight.

The local transport suite uses a loopback LiveKit server and independent browser contexts with synthetic media; it is not a test of cloud credentials, real speakers, microphones or Internet networks. See `docs/COMMUNICATION-VERIFICATION.md`.
