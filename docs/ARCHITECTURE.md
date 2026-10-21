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

Only `main` and `second` are accepted; their Cloud names are `${LIVEKIT_ROOM_NAME}-v2-main` and `${LIVEKIT_ROOM_NAME}-v2-second`. A Redis mutex serializes a persistent ledger of pending/active admissions across both rooms. Capacity counts known reservations and unknown active occupants. Lock expiry fences late writes: no saved reservation means no returned token. Cloud/Redis failures fail closed.

Every admission gets a unique media identity under its authenticated session. Switching or leaving revokes the old identity with LiveKit Cloud's explicit token cutoff before releasing its slot. Absent pending admissions are revoked after the 120-second token lifetime plus a 30-second margin; active admissions are never discarded merely for age. This relies on LiveKit Cloud revocation, which the local self-hosted media test server does not implement. See ADR-013 for the security boundary and hosted verification requirement.

Each room additionally has a server cap of eight and tokens carry matching RoomConfiguration for safe recreation. Tokens grant only their exact room, microphone, screen video/audio, subscriptions and refresh hints; no camera, administration, recording, self-metadata changes, agents or egress. Older deployments use different media room names and cannot issue tokens into these rooms.

## Media and chat

Microphone starts off; explicit activation requests permission. Screen sharing uses the native LiveKit/browser picker, separate audio/video sources, a default 1080p/30fps capture preference and 5 Mbps ceiling, with optional requested 720p/60fps (5 Mbps) and 1080p/60fps (8 Mbps). These are preferences, not measured guarantees. Adaptive stream and dynacast are enabled. Audio is rendered only for remote tracks; local previews are muted. Incoming mute changes only local playback volume. Device failures/canceled sharing are recoverable. SDK events update UI when the browser stops sharing. SDK disconnect and pagehide release tracks.

Chat is persisted through authenticated HTTP handlers with per-session Redis limits (30 writes/minute, 90 reads/minute). The database assigns stable ordered IDs and UTC timestamps, and a per-sender request UUID prevents retry duplicates. Latest-50 plus before/after cursors support catch-up. LiveKit data carries refresh hints only; polling reconciles committed records even without voice. Plain text is limited to 2000 UTF-8 bytes. Expired records are hidden on reads and physically deleted by daily Production cron or explicit Preview maintenance. See [ADR-012](adr/012-persistent-room-chat.md) and [database operations](CHAT-STORAGE.md).

The sidebar has Texto/# geral and two collapsible voice-room sections with authenticated rosters. Browsing and expansion do not join or leave. Secondary local volume controls use keyboard-accessible popovers. A single selected-screen video renderer moves into a mini-player in Chat; hiding it removes that video element without duplicating or disconnecting audio. Accessible Sala/Chat tabs change only view visibility. Room ownership, incoming audio, volumes, microphone state and the chat draft remain mounted across changes. Entering Chat alone does not request a LiveKit token or start microphone capture; joining voice always requires an explicit action.

The video element occupies the available viewing area for LiveKit's adaptive observer, using the screen's pixel density. `object-fit: scale-down` independently bounds the drawn image by its actual decoded dimensions; `contain` is the explicit fit-to-area option. Shrinking the observed element to a newly received low-resolution layer could prevent recovery after mini-player use, so decoded dimensions do not drive element sizing. Capture/publication targets are unchanged. One video renderer and the existing independent audio renderer serve all viewing modes; CSS cannot improve source resolution or encoding quality.

## Sources

The communication lifecycle, local preferences, device/output behavior and controlled media verification are described in [ADR-010](adr/010-room-communication-lifecycle.md) and [the verification guide](COMMUNICATION-VERIFICATION.md). The entry remains microphone-off; local volume settings never change another participant's microphone.

- https://docs.livekit.io/frontends/reference/tokens-grants/
- https://docs.livekit.io/reference/other/roomservice-api/
- https://docs.livekit.io/transport/media/screenshare/
- https://docs.livekit.io/reference/components/react/hook/usedatachannel/
- https://upstash.com/docs/redis/sdks/ratelimit-ts/features
- https://vercel.com/docs/headers/request-headers

## Private images

Authenticated `/api/attachments` issues short-lived write-only client upload authorization for a generated owner-bound key in private Vercel Blob. A second request decodes and normalizes the private upload using Sharp (JPEG/PNG/WebP, 5 MB, 20 MP, 8192 pixels per dimension, no animation), stripping metadata. The SQL write function atomically binds a ready image to one message by the same owner. Retries reuse stable upload/message IDs. Image retrieval checks the session and unexpired attached message before streaming the private normalized WebP, with no-store/nosniff. Original uploads are never served to readers.

Each environment needs a separate Blob store and matching `BLOB_ENVIRONMENT`. A mismatched binding fails closed. Cleanup processes up to 100 expired/orphaned images per call, deleting objects before metadata and retaining failed deletions for retry. Unattached uploads expire after one hour; attached images expire with their message after 30 days. Access stops immediately at expiration even if physical cleanup is delayed. Preview requires explicit cleanup; the existing daily Production cron will apply only after a future approved release.
