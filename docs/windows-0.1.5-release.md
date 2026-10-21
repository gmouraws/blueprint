# Blueprint Room 0.1.5 — unsigned Windows x64 test release

Production target: https://www.blueprint.app.br. Manual update; unsigned installer (Windows may show SmartScreen warnings). No secrets are embedded.

- Open a valid private `/stream` invitation in the browser, then choose **Abrir no aplicativo**. Browser continuation remains available.
- Separate guest window: no account, nickname, microphone, chat or access to member data. Invitation permissions, expiry, revocation and the eight-person streaming-space limit remain server-enforced.
- Explicit native screen selection; no audio, optional system audio, or experimental application audio on supported Windows builds. Never silently substitutes system audio.
- Existing member calls, tray lifecycle, shortcuts and authentication are preserved. Close hides; explicit Exit stops capture.

Verify the installer against SHA256SUMS-production.txt before running it. Application audio requires Windows build 20348 or later and may include the selected application's process tree, not just one tab/window. Real games, physical listening, hosted multi-user latency and browser/OS protocol confirmation remain manual acceptance checks. Automated tests and local synthetic media are not a claim of universal compatibility.

Recovery: keep 0.1.4 available; the owner can revert the download manifest or web deployment independently. Installed clients require manual downgrade/update.


Verification before publication: lint/TypeScript, 87 application tests, 18 desktop policy/lifecycle tests, 24 browser tests, clean Next.js Production build/output verifier, and a two-client local LiveKit screen/audio test passed. On Windows 11 build 26200, the actual Electron guest window denied microphone capture, opened the native picker with 28 windows (20 synthetic fixture windows), and transmitted process-loopback audio to a real local LiveKit receiver. Selected process/child signals were approximately -66 dB; unrelated-process and Electron-playback signals were below -145 dB. Stopping audio ended video too. These are synthetic signal measurements, not physical audibility or hosted multi-user acceptance.
