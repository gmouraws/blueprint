# Private room architecture

## Boundaries

Next.js serves the entry and room shell at /. Node.js route handlers expose POST /api/login, /api/token and /api/logout. Browsers connect directly to LiveKit Cloud for WebRTC and reliable data packets. Vercel never proxies media. Authenticated GET/POST /api/chat use Neon PostgreSQL over HTTPS; a separate protected cleanup endpoint supports retention. There is no custom WebSocket server or static export.

The root is request-rendered so configuration availability is determined at runtime. Missing/placeholder/invalid configuration disables entry. The client receives only a readiness flag and allowlisted variable names with missing, placeholder or invalid categories; parsed values and raw validation errors stay server-side. Malformed URLs return validation failures without throwing. All routes send noindex/nofollow/noarchive; robots disallows /. Old pages, sitemap, content registry, metadata assets and analytics have been removed.

## Authentication

Invite-only accounts replace the shared password in this Preview feature. See [ADR-017](adr/017-invite-only-accounts.md) and [account operations](ACCOUNTS.md). Better Auth runs server-side against the existing Neon database. Only the bounded application code/verify endpoints expose email OTP; no generic auth catch-all or password/social signup route exists. A transactional database invitation trigger guards every user insert, including automatic OTP signup. Existing active members do not require another invitation.

A common resolver checks the signed HttpOnly cookie, absolute session expiration, session revocation and active account status on every protected route. Browser sessions last 12 hours; opt-in persistent cookies last 30 days. Neither page visits nor token requests extend them. Cookies are Secure on HTTPS/Vercel, SameSite=Strict, and never stored in browser application storage. Old shared-password cookies are rejected and `/api/login` returns 410. Leaving media preserves login; forgetting access revokes that device session and its media leases.

Account UUID, device session UUID and per-admission media identities are separate. Multiple devices can authenticate, but joining voice from another session requires explicit takeover. All authenticated operations retain exact-origin checks, Redis rate limits and database environment guards. OTP values are HMAC-hashed, expire after five minutes, and allow three failed attempts; Redis limits send frequency and verification traffic. Generic responses avoid disclosing membership. Owner bootstrap requires an explicit server-created invitation; the first visitor never becomes owner.

Revocation commits session/lease invalidation before calling LiveKit Cloud with a token cutoff. Failed removals stay persisted and are retried by account polling, owner retry and scheduled/manual cleanup. HTTP denial is immediate; provider failure means media removal is pending, not successful. Session expiry is also reconciled by these cleanup passes. See ACCOUNTS.md for limits and hosted acceptance.

## Admission and permissions

Only `main` and `second` are accepted; their Cloud names are `${LIVEKIT_ROOM_NAME}-v2-main` and `${LIVEKIT_ROOM_NAME}-v2-second`. A Redis mutex serializes a persistent ledger of pending/active admissions across both rooms. Capacity counts known reservations and unknown active occupants. Lock expiry fences late writes: no saved reservation means no returned token. Cloud/Redis failures fail closed.

Every admission gets a unique media identity under its authenticated session. Switching or leaving revokes the old identity with LiveKit Cloud's explicit token cutoff before releasing its slot. Absent pending admissions are revoked after the 120-second token lifetime plus a 30-second margin; active admissions are never discarded merely for age. This relies on LiveKit Cloud revocation, which the local self-hosted media test server does not implement. See ADR-013 for the security boundary and hosted verification requirement.

Each voice room additionally has a server cap of eight and tokens carry matching RoomConfiguration for safe recreation. New voice tokens grant only their exact room, microphone, subscriptions and chat refresh hints; no camera, administration, recording, self-metadata changes, agents or egress. Screen publishing and viewing use separate screen-only transports; see ADR-014. Older deployments use different media room names and cannot issue tokens into these rooms.

## Media and chat

Microphone starts off; explicit activation requests permission. Screen sharing uses the native LiveKit/browser picker, separate audio/video sources, a default 1080p/30fps capture preference and 5 Mbps ceiling, with optional requested 720p/60fps (5 Mbps) and 1080p/60fps (8 Mbps). These are preferences, not measured guarantees. Adaptive stream and dynacast are enabled. Audio is rendered only for remote tracks; local previews are muted. Incoming mute changes only local playback volume. Device failures/canceled sharing are recoverable. SDK events update UI when the browser stops sharing. SDK disconnect and pagehide release tracks.

Chat is persisted through authenticated HTTP handlers with per-session Redis limits (30 writes/minute, 90 reads/minute). The database assigns stable ordered IDs and UTC timestamps, and a per-sender request UUID prevents retry duplicates. Latest-50 plus before/after cursors support catch-up. LiveKit data carries refresh hints only; polling reconciles committed records even without voice. Plain text is limited to 2000 UTF-8 bytes. Expired records are hidden on reads and physically deleted by daily Production cron or explicit Preview maintenance. See [ADR-012](adr/012-persistent-room-chat.md) and [database operations](CHAT-STORAGE.md).

Own-content deletion uses the same authentication, exact-origin and write-rate protections. Migration 003 atomically checks the account UUID and nullable account ownership, revokes image access and records a deletion cursor. History and changes share a repeatable-read snapshot; clients apply deletion markers to late responses and older pages. Content-free tombstones prevent send retries from resurrecting messages until normal expiry. Blob cleanup remains retryable and independent of visibility. See [ADR-015](adr/015-message-deletion.md).

Noise suppression is a saved microphone capture preference. Supported browser constraints are requested and actual settings reported; a single SDK track restart handles browsers that cannot change processing in place, retaining room connection, selected input and mute state. Global deafen removes incoming playback renderers across voice/screen transports without disconnecting or changing microphone state. It also zeros active notification tones. Undeafen reattaches only the permitted tracks with existing individual volumes/mutes; no second mute system is introduced.

Authenticated `POST /api/view` issues hidden read-only credentials for the selected screen transport, never a voice token. Each admitted voice participant also receives a screen publisher token restricted to screen sources. The existing combined eight-person admission and voice roster exclude these screen transports. Cross-room screen audio starts off and requires an explicit listening action; one screen renderer and one selected-screen audio path follow the viewed room. See [ADR-014](adr/014-screen-only-viewing.md) for permissions, cleanup, capacity and rollout.

The sidebar has Texto/# geral and two collapsible voice-room sections with authenticated rosters. Single click selects a room; double click joins through the safe switching flow. A separate disclosure controls expansion and the selected-room header provides a touch/keyboard join button. Browsing and expansion do not join or leave. Secondary local volume controls use keyboard-accessible popovers. A single selected-screen video renderer moves into a mini-player in Chat; hiding it removes that video element without duplicating or disconnecting audio. Accessible Sala/Chat tabs change only view visibility. Room ownership, incoming audio, volumes, microphone state and the chat draft remain mounted across changes. Entering Chat alone does not request a LiveKit token or start microphone capture; joining voice always requires an explicit action.

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
