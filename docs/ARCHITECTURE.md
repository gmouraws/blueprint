# Private room architecture

## Boundaries

Next.js serves the entry and room shell at /. Node.js route handlers expose POST /api/login, /api/token and /api/logout. Browsers connect directly to LiveKit Cloud for WebRTC and reliable data packets. Vercel never proxies media. Authenticated GET/POST /api/chat use Neon PostgreSQL over HTTPS; a separate protected cleanup endpoint supports retention. There is no custom WebSocket server or static export.

The root is request-rendered so configuration availability is determined at runtime. Missing/placeholder/invalid configuration disables entry. The client receives only a readiness flag and allowlisted variable names with missing, placeholder or invalid categories; parsed values and raw validation errors stay server-side. Malformed URLs return validation failures without throwing. All routes send noindex/nofollow/noarchive; robots disallows /. Old pages, sitemap, content registry, metadata assets and analytics have been removed.

## Authentication

Server validation normalizes nicknames (2–24 characters; letters, numbers, spaces, dot, underscore, hyphen), bounds the JSON body to 4096 bytes, rejects unexpected fields and compares SHA-256 password digests in constant time. Every mutating request requires an exact approved Origin; cross-site fetches are rejected. Allowed origins come from APP_ORIGIN and trusted Vercel deployment/branch environment variables, never client host headers.

Successful login sets an HS256-signed HttpOnly, SameSite=Strict cookie, Secure on HTTPS/Vercel. Local HTTP development is the only non-Secure case. The default is a browser-session cookie (no Max-Age/Expires) with a server-enforced 12-hour lifetime. Opting into "Manter conectado neste dispositivo" sets both the signed lifetime and cookie Max-Age to 30 days. The signed remember claim determines the maximum permitted lifetime; neither page visits nor token requests extend it. Browser session restoration can restore session cookies, so server expiration remains authoritative. Existing cookies without the claim retain their 12-hour ceiling.

The root verifies the cookie per request and sends only the validated nickname to the client. Returning users still explicitly click to join; every /api/token request revalidates the session and applies its normal rate limit before contacting LiveKit. A cookie that expires or becomes invalid while the page is open returns the user to password entry. Neither session recognition nor joining captures a microphone. The authenticated nickname is fixed; forgetting access allows a different nickname/password login. Standard username/current-password autocomplete supports browser password managers; application storage holds no passwords or auth tokens.

Each login receives a random UUID; names cannot be updated through LiveKit. The signing key depends on both SESSION_SECRET and ROOM_PASSWORD, so rotating either invalidates cookies. "Sair da sala" disconnects media and preserves authentication. The separate "Esquecer acesso neste dispositivo" entry action calls /api/logout, clears the cookie and attempts server-side participant removal. A failed logout is reported, never presented as successful. A stolen signed cookie remains usable until expiry/rotation; there is no individual session revocation database. Password rotation blocks future application admission but does not forcibly end already-connected media sessions. A shared secret does not establish a person's real identity. One browser session uses one identity; another tab using it can replace its connection. See [ADR-011](adr/011-remembered-room-access.md).

Upstash's single-region sliding-window counters protect login globally (60/10 minutes) and by HMAC-hashed Vercel client IP (10/10 minutes). Local development uses a shared local bucket. Token requests are limited per signed identity (12/minute). Analytics and in-memory cache are disabled. Timeout/network/service failures fail closed; there is no serverless-memory fallback. Counters expire automatically; raw IPs/passwords are not stored. Sharing a network shares an IP budget. Distributed abuse can exhaust the global budget and temporarily deny login; a stronger public-access model is outside this eight-person scope.

## Admission and permissions

Every token is issued only after authenticated server-side createRoom(maxParticipants=8). An existing room whose actual cap differs causes refusal, rather than credential issuance. A preflight full-room response is only a convenience; it does not enforce admission.

Each signed 120-second LiveKit token also embeds RoomConfiguration(maxParticipants=8, emptyTimeout=300, departureTimeout=30). If LiveKit deletes the empty room between issuance and join, it recreates the room with the same cap. All simultaneous joiners have the same configuration. LiveKit enforces the admission limit, including competing ninth joins. Tokens grant only the fixed room, microphone, screen video/audio, subscriptions and data publishing. No camera, room administration, listing, recording, self-metadata changes, agents or egress.

Existing active LiveKit connections refresh/reconnect using SDK/server behavior; the 120-second token limits initial admission, not call duration. After a terminal disconnect, the UI requires an explicit rejoin with a fresh token; password entry is needed only if the application session is invalid. The user may retry after a capacity or availability error; no unlimited fallback room exists. Do not manually create another room with the same name and a different cap in the Cloud console.

## Media and chat

Microphone starts off; explicit activation requests permission. Screen sharing uses the native LiveKit/browser picker, separate audio/video sources, a 1080p/15fps capture preference and 2.5 Mbps video encoding ceiling. These are preferences, not measured guarantees. Adaptive stream and dynacast are enabled. Audio is rendered only for remote tracks; local previews are muted. Incoming mute changes only local playback volume. Device failures/canceled sharing are recoverable. SDK events update UI when the browser stops sharing. SDK disconnect and pagehide release tracks.

Chat is persisted through authenticated HTTP handlers with per-session Redis limits (30 writes/minute, 90 reads/minute). The database assigns stable ordered IDs and UTC timestamps, and a per-sender request UUID prevents retry duplicates. Latest-50 plus before/after cursors support catch-up. LiveKit data carries refresh hints only; polling reconciles committed records even without voice. Plain text is limited to 2000 UTF-8 bytes. Expired records are hidden on reads and physically deleted by daily Production cron or explicit Preview maintenance. See [ADR-012](adr/012-persistent-room-chat.md) and [database operations](CHAT-STORAGE.md).

The sidebar has Texto/# geral and Voz/Sala principal. Accessible Sala/Chat tabs change only view visibility. Room ownership, incoming audio, volumes, microphone state and the chat draft remain mounted across changes. Entering Chat alone does not request a LiveKit token or start microphone capture; joining voice always requires an explicit action.

## Sources

The communication lifecycle, local preferences, device/output behavior and controlled media verification are described in [ADR-010](adr/010-room-communication-lifecycle.md) and [the verification guide](COMMUNICATION-VERIFICATION.md). The entry remains microphone-off; local volume settings never change another participant's microphone.

- https://docs.livekit.io/frontends/reference/tokens-grants/
- https://docs.livekit.io/reference/other/roomservice-api/
- https://docs.livekit.io/transport/media/screenshare/
- https://docs.livekit.io/reference/components/react/hook/usedatachannel/
- https://upstash.com/docs/redis/sdks/ratelimit-ts/features
- https://vercel.com/docs/headers/request-headers
