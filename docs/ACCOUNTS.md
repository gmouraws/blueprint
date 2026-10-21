# Invite-only account operations

## Scope and current status

The owner authorized the accounts Production cutover, conditional on release verification. Preview migration 004, owner OTP login, owner controls, preferences and account-owned chat persistence have passed hosted checks. Resend reports the domain Verified and the test email Delivered; the owner separately completed login. Production configuration has been prepared with an independent BETTER_AUTH_SECRET, the canonical origin and a new media namespace. The owner confirmed voice entry and exit in a normal browser; the Codex browser did not complete that connection. Physical multi-user audio remains unverified. Preparation is not a completed release. See RELEASE.md for the existing deployment and pre-cutover database snapshot.

## Configuration

Keep the existing APP_ORIGIN, SESSION_SECRET (Redis HMAC), LiveKit, Upstash, DATABASE_URL, CRON_SECRET and private Blob variables. Add server-only BETTER_AUTH_SECRET (at least 32 random bytes), RESEND_API_KEY (Preview-only restricted sending key), and RESEND_FROM (bare address on a verified sender domain). ROOM_PASSWORD is no longer used for authentication. Use independent Production values later; never pull Production secrets locally. APP_ORIGIN must be the exact Preview branch origin; Vercel-provided deployment and branch origins are explicitly allowed, not arbitrary request hosts.

Resend setup: use the Free plan without upgrades, verify a sender you control, disable open/click tracking, create a sending key restricted to that sender, and save it only in Vercel Preview. DNS/provider terms require the owner's authorization. Do not use arbitrary recipients for tests. Real delivery is unverified until an explicitly authorized recipient receives and uses a code. Readiness shows missing/invalid variable names or migration/owner setup status without values. Free-plan quotas and sender restrictions must be checked in the actual Resend account before acceptance; no paid subscription is provisioned.

## Migration and bootstrap

Use a secure local/server environment with the isolated Preview database, never Production credentials. Standalone scripts do not auto-load Next.js `.env.local`; use Node's `--env-file` with a gitignored local file or injected environment. Do not print URLs/secrets.

1. For an empty database only, `npm run db:migrate` applies 001–003 and establishes the environment marker. It refuses to overwrite functions after account tables exist.
2. `npm run db:migrate:accounts` applies repeatable migration 004 in a transaction with the account lock and environment assertion. It refuses Production. It adds nullable ownership without a history backfill, Better Auth tables, invitations, media leases, avatars and database guards.
3. Set BOOTSTRAP_OWNER_EMAIL to the owner's explicitly authorized address in the server environment, then run `npm run accounts:bootstrap`. It creates a seven-day owner invitation only if no active owner or valid owner invitation exists. Remove the one-off variable afterward. No first-visitor owner path exists.
4. Deploy/redeploy the feature Preview after environment changes. Owner requests a code through the UI, confirms it and explicitly chooses chat/voice. A code never starts microphone capture. Create member invitations through Meu perfil.

The SQL editor can apply the same reviewed migration under BEGIN, environment assertion and COMMIT if secret-only provider credentials prevent local scripts. Verify table presence and unclaimed-history counts without reading private message bodies. Bootstrap must still target an explicitly authorized address.

## Ownership, profiles and preferences

New messages/attachments derive `user_id` from the active authenticated account on insert. Display names remain snapshots. No nickname or old sender-ID matching claims history; legacy records have null ownership and cannot be self-deleted by a new account. Existing retention remains. Historical account messages render the current avatar; legacy messages retain initials.

Avatars accept JPEG/PNG/WebP up to 2 MB with actual decoding/dimension bounds, strip metadata and normalize within 256 pixels. Reads require membership; writes always target the caller. Replacement switches the database reference atomically, then deletes old private objects. Failed deletion stays retryable; abandoned pending uploads age out after one hour. Avatars do not expire with chat history.

Device overrides use `blueprint.preferences.v2:<account UUID>:<platform>`. Output/input identifiers and processing remain local. Shortcuts instead use authoritative account JSONB keys `browser` and `windowsDesktop`; old OS-scoped account bindings are retained as a fallback until explicitly saved. Old local bindings never shadow the account and can be explicitly imported. Versioned partial shortcut saves preserve unrelated preferences and update mounted controls immediately. A concurrent edit returns 409. Logout/account changes clear cached bindings and native registration. Live media/capture state is never synchronized. See ADR 019. A different account after session expiry clears the previous in-memory draft; the same account retains it.

## Revocation and cleanup

Revocation first denies HTTP/session issuance, then removes all associated voice, publisher and viewer identities using LiveKit Cloud's revocation cutoff. Issuance and revocation serialize on member/session rows. Provider errors leave persisted pending leases and a visible owner retry action. Account polling (30 seconds while open), including an expired-session poll, retries cleanup; the existing cleanup endpoint/cron does too. Preview has no scheduled cron: use `npm run db:cleanup` with Preview credentials for unattended cleanup. Token grant lifetime is 120 seconds; expiry alone does not disconnect a connected LiveKit peer. Cloud cleanup/revocation must pass hosted acceptance; there is no promise of immediate media termination during a provider outage or an idle Preview without cleanup. Local LiveKit does not prove Cloud token-cutoff behavior.

Client expiry disconnects media, closes viewing subscriptions and offers a modal code login without automatically rejoining. Same-account drafts survive. Session cookies and OTPs are never stored in application localStorage or returned in auth JSON. The only public API routes are bounded code/verify; no generic Better Auth route is mounted.

## Production cutover sequence

Record current deployment/commit and Neon recovery point; pause new entry and drain existing voice/view rooms. Assign a new Production LIVEKIT_ROOM_NAME namespace so older retained deployments cannot mint credentials into account rooms. Configure independent Production auth/email values and verify sender delivery. Apply 004 plus explicit owner bootstrap to Production in a coordinated maintenance window, then merge/deploy account code. All legacy cookies are rejected. Verify owner login, member invite, remembered expiration, chat/image access, cross-device takeover and Cloud revocation before reopening access.

Recovery is not a code-only rollback: 004's insert guards reject old password-generated identities. Prefer fixing forward or restoring the recorded database recovery point together with the old deployment under maintenance. A database restore can lose post-cutover messages/accounts and orphan Blob objects; preserve exports/recovery points and reconcile storage. Do not drop tables, remove guards or claim old records by nickname as an automatic rollback. Restore only with explicit owner approval.

## Acceptance

- Authorized owner receives OTP; uninvited/expired/revoked invitation cannot create an account; reuse fails.
- Browser/remembered sessions, logout, disable/revoke, owner protection and retryable Cloud cleanup.
- Two devices share ownership, but second voice join requires takeover; eight-person combined cap remains.
- New-content deletion and legacy isolation; avatar replace/remove and private reads.
- Device/default precedence, explicit shortcut clearing/import, concurrent settings conflict.
- Real microphones/output, screen audio, room isolation and revoked Cloud token reuse on physical devices.

Automated tests use actual Better Auth and PostgreSQL-compatible PGlite with controlled mail/storage/media. Browser/transport fixtures are test-only; they are not a deployed bypass. Provider email and real-device audio must be reported separately.
