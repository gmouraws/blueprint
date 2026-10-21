# ADR-017: Invite-only accounts

Status: accepted for implementation and Preview; Production cutover is not authorized.

## Decision

Use Better Auth 1.7.12 email OTP, PostgreSQL through the existing isolated Neon databases, and Resend transactional plain-text email. No public registration, password credentials, social login, external profile fetching or native app is added. `pg` is required by Better Auth's PostgreSQL adapter; existing Neon HTTP queries remain for chat.

A database trigger atomically consumes an eligible invitation for every user creation. Owner bootstrap creates a seven-day owner invitation through a guarded server script. Sole-active-owner protection is enforced in PostgreSQL. The UI can authorize/revoke member invitations, disable/reactivate members, and revoke sessions; it does not automatically email invitations.

Sessions last an absolute 12 hours (browser cookie) or 30 days (remembered cookie). A common resolver checks account and session state without cookie caching. Stable account identity owns new content; legacy content remains null/unclaimed. A session owns media leases, and a separate unique identity scopes each voice/view connection. Cross-device voice takeover is explicit. LiveKit Cloud token revocation and persisted cleanup retries are required for removal, including already issued tokens.

Private normalized avatars use the existing Blob store and separate metadata/cleanup from chat's 30-day retention. Historical account-owned messages show the sender's current avatar but retain their original name snapshot. Legacy messages show initials only.

Preferences follow device override, account default, application default. Devices and processing never upload; shortcuts support platform-specific account defaults and explicit local empty bindings. Legacy import is explicit, local and one-time per account/platform. Account writes use optimistic version checks. Active microphone/mute/call state never synchronizes.

## Consequences

Authentication now depends on Neon and email delivery as well as existing Redis. Failures close access. Existing password sessions cannot survive cutover; a valid owner invitation and tested email delivery must precede Production. Rolling back application code alone cannot safely undo account ownership or database guards. See ACCOUNTS.md for sequencing, recovery and limits.

## Official references

- https://www.better-auth.com/docs/plugins/email-otp
- https://www.better-auth.com/docs/adapters/postgresql
- https://www.better-auth.com/docs/concepts/session-management
- https://resend.com/docs/api-reference/emails/send-email
