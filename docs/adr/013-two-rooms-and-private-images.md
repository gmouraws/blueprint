# ADR-013: Two voice rooms and private chat images

Status: owner-approved implementation for Preview only. A separate approval is required before Production.

This extends ADR-012 with exactly two voice rooms (Sala principal and Sala 2), one shared chat, private JPEG/PNG/WebP images up to 5 MB, safe HTTP(S) links and a stream mini-player. It supersedes the former single-room/no-upload restrictions. The later owner refinement makes screen quality best effort; sustained 60 fps is not a release condition.

## Voice admission and lifecycle

Use `${LIVEKIT_ROOM_NAME}-v2-main` and `${LIVEKIT_ROOM_NAME}-v2-second`. The versioned names isolate this admission system from tokens issued by older immutable deployments. Only `main` and `second` are accepted from clients. Every token is restricted to one room. A Redis mutex and persistent admission ledger serialize global capacity checks across both rooms; reserve before returning a token. Count active participants and unexpired pending admissions, including competing requests. Never free an admission just because a client heartbeat stopped.

Each admission has a unique media identity. Before releasing a stale reservation, leaving or switching, revoke that identity through LiveKit Cloud's explicit `revokeTokenTs` cutoff, including identities no longer present. This prevents refreshed or unconsumed tokens from reopening a released slot. New admissions never reuse revoked identities. A failed revocation or lock operation fails closed. The local self-hosted test server cannot establish Cloud revocation behavior; that boundary needs hosted verification.

Browsing/expanding rooms changes UI only. A switch stops capture and disconnects before requesting the destination token; it always starts microphone-off. Chat and local preferences remain mounted. A single video renderer moves between expanded view and chat mini-player; audio has one independent renderer per audible track. Membership sounds share the original oscillator system and suppress initial snapshots/reconnects and other-room activity.

## Images

Use private Vercel Blob with separate environment stores and Neon metadata. Direct authenticated upload authorization avoids the Vercel function request-size limit for 5 MB images. Only generated, owner-bound temporary keys are allowed. Completion downloads the private object, decodes it with Sharp under pixel limits and re-encodes a metadata-free WebP before making it attachable. Browser-provided MIME/dimensions are not trusted. No arbitrary remote URLs are fetched.

Message persistence atomically consumes an owner-bound ready attachment. Stable request IDs make retries idempotent. Downloads require a valid application session and an unexpired attached message; raw storage URLs never appear in messages. The existing cleanup mechanism removes abandoned/expired objects before deleting their metadata. Failed deletion retains metadata for retry. Read-time expiration is independent of cleanup timing.

No paid resources, DNS changes or Production release are authorized by this change. See the implementation/verification documentation for actual provisioned state and remaining acceptance.
