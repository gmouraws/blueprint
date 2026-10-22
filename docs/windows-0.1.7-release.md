# Blueprint Room 0.1.7 — streaming-only Windows test

Normal startup uses the stream-focused web entry. Discord remains responsible for voice/chat. The tray exposes application restore, active stream restore and explicit Exit; retired microphone/deafen/combined controls are removed. Guest protocol, capture isolation and shutdown fences from 0.1.6 are preserved.

The hosted stream experience connects only when explicitly publishing/watching, supports 30/60 fps with existing 1080p quality targets, and records bounded anonymous device-local usage estimates.

Unsigned Windows x64 test installer; manual updates. Automated policy/lifecycle and build checks are distinct from actual installation, physical audio and multi-user acceptance. Follow the verification record in docs/RELEASE.md for results; this note alone does not assert those tests passed.
