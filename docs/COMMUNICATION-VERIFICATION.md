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
