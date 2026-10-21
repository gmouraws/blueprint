# Communication verification

## Reproduce the automated checks

Run `npm run check`, `npm run build`, and `npm run test:e2e` normally.

The additional `npm run test:transport` suite needs the official LiveKit Server 1.13.10 binary running **only on loopback**. It does not use or need cloud credentials. Use this test-only configuration:

```yaml
port: 7880
bind_addresses: [127.0.0.1]
rtc:
  node_ip: 127.0.0.1
  tcp_port: 7881
  port_range_start: 50100
  port_range_end: 50130
  use_external_ip: false
keys:
  blueprint-test: local-test-secret-not-a-production-credential
logging:
  level: error
```

Run `livekit-server --config <local-config-path>` before the transport suite. Keep binaries, configuration and generated media under ignored `.generated/`. The Windows amd64 v1.13.10 archive used for this investigation has SHA-256 `fd4b7c2c3c1e4c71adaa4f6a046ad1c0abaaaf1e09fae904b35bf231ffae11d2`; obtain other platforms from the official release and verify their published checksums. No server binary or test audio is committed.

The tests serve the optimized application on port 3005, intercept authentication/token/logout to provide local test identities and chat HTTP with a test-only adapter backed by embedded PostgreSQL, and connect the actual LiveKit client/server media and data transports. The chat adapter uses the real migration and write function; cloud Neon connectivity is a separate deployment check. Application authentication is separately covered by the existing endpoint/unit/browser tests. This harness is never enabled in application code or deployed.

A generated continuous WAV supplies microphone input. Test capture disables speech DSP for that synthetic signal; application echo cancellation, noise suppression and gain control remain enabled. Screen capture uses a controlled canvas and oscillator stream. No webcam, human voice, screen contents or cloud secrets are captured. Browser traces are off for this suite so participant tokens are not written to traces. Screenshots contain test identities only.

## Evidence and limits

- Baseline: original device enumeration repeated 27,630 times in approximately 8.6 seconds; no microphone capture was needed to trigger it. Passing inline callbacks recreated the hook's observable and reset its list on every render.
- Baseline: chat failed with two connected peers despite data-publishing grants. The original inline receive callback recreated `useDataChannel`'s send-state subscription; the installed helper accesses a subscriber before sending, making that lifecycle fragile. This is a code-level explanation, not a captured production exception. The replacement exercises the official SDK publishing API directly.
- Baseline: the remote audio element existed and was playing, at volume 1. That did not establish audibility. No single cause for every reported production audio failure has been proved. Autoplay restrictions and output routing remain relevant hypotheses for individual devices.
- Automated checks cover received audio energy while Chat is visible, view changes without additional peer connections, durable chat and missed-hint polling, single capture across repeated mute/unmute, local/global volumes, selected-screen audio, explicit playback recovery, device changes, capture cancellation/cleanup, and membership/reconnection behavior. Safe test measurements and screenshots are written to ignored `test-results/`.
- One final controlled run measured 160 ms for microphone activation, three enumerations, one capture across repeated mute/unmute, and increasing/nonzero received audio energy at both peers. These are local synthetic-test observations, not production latency or a promise about hardware/permission-prompt timing.
- Automated media evidence establishes behavior in controlled Chromium sessions against local LiveKit. It does not establish human-audible playback, cloud media connectivity, all browser/OS combinations, Bluetooth switching, network resilience or eight simultaneous physical users.

## Two-person Preview acceptance

1. Use two computers/headphones. Join without activating a microphone; receiving audio must not request microphone permission. Then test each direction separately and confirm audible speech.
2. Grant microphone permission and inspect real device names. Switch inputs and supported outputs; unplug/reconnect a selected device. Confirm the fallback notice and actual output. Unsupported output selection must explain the OS default.
3. Repeat mute/unmute, deny permission once and recover. Cancel a pending activation, leave during a prompt, and verify no late capture remains. Run/stop the optional prejoin meter and join with the mic still off.
4. Send chat using Enter and the button, Shift+Enter multiline, and an IME. Disconnect during a send; the draft must remain and retry must work. Do not interpret accepted send as a read receipt.
5. Each participant shares a source with audio enabled in the browser picker. Switch screens; hear only the selected screen, independently of voices. Test individual volume, screen volume and global mute/restoration; check for echo/duplicates.
6. Leave/rejoin and interrupt networking. Check real connection states, no reconnect arrival sound, sound preference/global mute, preserved session volumes, and released devices on exit.

Production remains unchanged until this Preview is reviewed and a separate production release is authorized.

## Primary references

- [LiveKit Room API](https://docs.livekit.io/reference/client-sdk-js/classes/Room.html)
- [LiveKit audio renderer](https://docs.livekit.io/reference/components/react/component/roomaudiorenderer/)
- [LiveKit data packets](https://docs.livekit.io/transport/data/packets/)
- [MDN device enumeration](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices)
- [MDN output selection](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId)

The persistent-chat suite additionally checks reload/late-join history, no-voice access, stable pagination, response-loss idempotency, draft preservation, access rejection and retention/isolation. Review [CHAT-STORAGE.md](CHAT-STORAGE.md) before any production merge.

The deployed Preview also saved and recovered a real verification message after reload with voice disconnected, using owner-completed authentication and the actual Redis/Neon services. A voice connection attempted in the Codex in-app browser ended with the application's connection-failure message. No microphone was activated, and no cloud media acceptance is claimed. The cause was not established; verify voice on supported physical browsers/devices before any production approval. A final tablet review also found and fixed composer/settings overlap; the transport screenshot test now asserts their boundaries do not overlap.

## Two-room and private-image Preview verification

The extension is implemented on `codex/room-communication` after PR #9 was merged. It is a new Preview review, not authorization to release to Production.

- Automated admission tests cover concurrent requests, the combined eight-slot limit, pending reservations, active occupants, expired locks, stale revocation, scoped room tokens and owner-bound leave operations. Provider failure denies admission.
- Controlled Chromium/LiveKit tests verify separate voice-room participants and media, microphone-off switching, released capture, shared chat/draft continuity, view-only disclosure, one local switch tone, no reconnect tone, and a single mini-player video/audio path. These use loopback media, test authentication and embedded PostgreSQL; they do not establish Cloud token-revocation semantics or real-device audibility.
- Image tests cover full decoding/normalization, forged MIME, malformed/oversized/animated files, ownership, transaction atomicity, idempotency, expiration, safe links, authentication/Origin rejection, paste/removal, failed completion/retry, viewer and reload. The browser fixture simulates an already uploaded temporary object; real Blob upload is a separate hosted check.
- Responsive screenshots at 1440, 768 and 375 pixels are kept under ignored `.generated/review/two-rooms/`. Keyboard controls and automated axe checks remain part of the browser suite.
- Capture/publication options are requested targets. The moving test source is a synthetic 640×360 canvas producing approximately 30 frames/s. Receiver statistics are saved without credentials; they do not prove 720p/1080p or 60 fps delivery on physical devices. No codec is forced.

Preview provisioning is verified: private `blueprint-room-images-preview`, Hobby plan, IAD1, connected only to Blueprint Preview. The generated token is sensitive and Preview-only, with `BLOB_ENVIRONMENT=preview`. Migration 002 executed transactionally against `blueprint-room-preview`; a subsequent read confirmed both the attachment table and write function. No Production database, storage connection, domain or deployment was changed.

Before production approval, two people should test audible voice in both directions, actual input/output routing, repeated room switching and reconnection, ninth-user rejection across the two rooms, moving screen content with measured sender/receiver stats, image upload/retry/reload/access expiry, mini-player hide/expand and mobile controls. Test Cloud token revocation by attempting to reuse a prior admission after switching. Provision a separate Production Blob store and apply migration 002 only in a separately authorized production release.

Local gate results for this extension: lint and TypeScript passed; 44 unit/integration tests passed; 15 browser tests passed; seven real local LiveKit transport tests passed; the clean production build and output verifier passed, including a Blob-token canary. Production dependency audit reported zero vulnerabilities. The latest controlled receiver sample was 640×360 at 30 fps (17 decoded frames); this short synthetic sample is not a sustained throughput benchmark. A safe microphone sample measured 159 ms activation, three enumerations and one capture across repeated mute/unmute; no physical-device latency claim follows.

Hosted Preview verification saved a synthetic 320×180 image through the actual private Blob upload, server normalization and Neon message write. Its authenticated thumbnail and enlarged view decoded successfully and survived reload without joining voice. GitHub Actions completed successfully. An unauthenticated external download check stopped at Vercel Deployment Protection; the connector could not obtain protected-deployment access (403), so hosted application-level rejection remains unverified. Local endpoint tests cover rejection.

A further in-app-browser voice attempt stayed in the joining state for an extended period and eventually failed. The client now bounds the SDK connection attempt to 35 seconds and awaits disconnect before allowing retry, including initial entry and room switching. This bounds the SDK retry budget; it does not establish the underlying Cloud/browser network cause or claim that physical audio works. Focused tests cover successful connection, timeout cleanup and transport failure. A later hosted request returned HTTP 200 from `/api/token`, confirming the authenticated admission path; the browser subsequently displayed the timeout notice with chat intact, and leaving returned to recognized access without a release error. A connected Cloud peer was not observed. Room-entry controls now also reject overlapping requests during initial connection and reconnection. The final unit/integration and browser suites passed 47 and 17 tests respectively; the seven real loopback transport checks, lint, TypeScript and production build/output verification also passed.

## Compact viewing refinement (Preview only)

The previous `object-fit: contain` viewer could upscale a low-resolution received image to the whole viewing area. This is a confirmed rendering mechanism, not proof of the cause of every reported soft Cloud stream. Capture and publication encoding remain unchanged. The new default uses `scale-down`; adaptive observation still measures the available element area, with actual screen pixel density, so bounding the image does not trap a low-resolution subscription after mini-player use. Optional fit and fullscreen retain one video/audio path. See the [LiveKit adaptive-stream reference](https://docs.livekit.io/reference/client-sdk-js/classes/RemoteVideoTrack.html).

The controlled browser test inspects screenshot pixels: a received 640×360 source draws at 640 pixels wide, centered within a wider element. A separate 1280×720 moving-canvas source is received at that resolution before mini-player use and again after expansion. These synthetic loopback observations do not prove a production bitrate, sustained frame rate or physical-display sharpness.

Responsive artifacts are generated in ignored `.generated/review/viewing/` at 1440×900, 1366×600, 768×900, 375×667 and 320×568. The empty composer measures 57–61px; the 1366×600 chat has approximately 337px of scrollable messages with the mini-player present. Controls do not resize the video. Keyboard focus, touch, fullscreen, independent microphone/incoming mute, saved screen volume, single playback path, image retry/history and room switching are covered. Small screens retain scrolling room rosters and a hide-mini-player action to prioritize conversation space.

Manual Preview acceptance remains necessary for physical microphone/headphone routing, audible speech, mobile virtual keyboards and platform-specific fullscreen, Cloud/network quality changes, and sustained screen motion. This refinement adds no services, dependencies, migrations or configuration; publishing its feature branch must not merge or deploy Production.

## Cross-room screen viewing (PR #11, Preview only)

The confirmed defect was that browsing changed UI state while the player still read tracks from the joined voice connection. The second room had no viewing connection or scoped token. [ADR-014](adr/014-screen-only-viewing.md) documents the separate screen transports required to enforce microphone isolation on the server, including the failed local probe of administrative subscriptions with `canSubscribe: false`.

Single click selects and opens a room; double click joins its voice through the existing safe switch. A separate disclosure button changes only the participant list. A compact selected-room header action supports keyboard/touch. The joined room and viewed room have distinct indicators. Other-room screen audio starts off and requires explicit listening; global mute, screen volume and output selection still apply.

Four independent Chromium contexts connected to real loopback LiveKit with synthetic microphones/screens: two publishers in different voice rooms, a voice participant browsing the other room, and a chat-only viewer. The tests verified second-room video, no other-room microphone renderer, opt-in screen audio, global mute and saved volume, collapse without joining, keyboard joining, microphone-off switching, shared chat continuity, mini-player, stream termination and no extra membership tones from viewing. Repeated/rapid navigation and an offline/reconnect cycle verified observer cleanup. A discovered stale-observer reconnect was fixed with owner-bound server cleanup and serialized connection lifetimes. An already absent observer is an idempotent cleanup result; provider authorization/network failures remain retryable errors.

The full local transport suite passed nine tests. The application browser suite passed 18 tests, including accessibility, safe viewing failures, sessions, chat and private images. Responsive review artifacts at 1440×900, 1366×768, 768×1024, 375×812 and 320×740 are ignored under `.generated/review/cross-room/`; there was no horizontal overflow. Synthetic video was 640×360. These checks do not establish human-audible playback, physical device behavior, hosted token revocation, NAT traversal or sustained frame rate.

All Preview testers must reload/rejoin this version together because older clients publish screens in the former mixed transport. The existing voice namespace and combined eight-slot Redis ledger are unchanged. Additional screen connections consume existing LiveKit quota; no plan change, configuration, migration or dependency was added. Production must remain unchanged.

Manual Preview acceptance: use participants in both rooms; single-click between them while keeping the original voice call; explicitly enable the other screen's audio and compare with global mute; join by double click and the keyboard/header action; repeat room changes, network interruption and presenter stop. Check real microphone/headphone routing and no duplicate audible playback. Attempt reuse of a prior Cloud admission after switching and verify the combined ninth-person rejection. Local tests are not a substitute for these hosted/device checks.
