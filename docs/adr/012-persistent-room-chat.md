# ADR-012: Independent voice views and durable group chat

Status: accepted by the owner; Preview implementation, not a production release.

The owner replaced the ephemeral-only chat requirement with one shared `# geral` channel retained for 30 days, readable and writable without joining the single eight-person voice room. Existing audio/device, session, privacy and repository-isolation protections remain in force.

Use two independent Neon PostgreSQL projects on the Vercel Marketplace **Free** installation: one connected only to Preview and one only to Production. Disable automatic deployment branching: cloning a production branch could copy private history into Preview. No Neon Auth, Realtime, paid tier, card, add-on or automatic upgrade is needed. A singleton environment binding in each database rejects application reads, writes and cleanup aimed at the wrong environment.

Use the official HTTP serverless driver, parameterized SQL and one reviewable SQL migration. No ORM, accounts database, custom socket service or publishing framework. Initialize the driver only when an authenticated operation needs it. Session verification and Redis write limits precede database access; shared-password rotation invalidates chat access just as it invalidates token issuance. Display names are not verified identities.

The database owns sender identity, display-name snapshot, timestamp and monotonically increasing message ID. The only additional message field is a per-sender request UUID, necessary to make retries idempotent. A transaction advisory lock serializes message ID allocation through commit; this avoids incremental cursors skipping a lower ID that commits after a higher one. Contention is acceptable for this small group. Reusing a request UUID with different text fails. An acknowledgement means persisted, not delivered or read by every member.

Latest-50 and before/after ID cursors support history and catch-up. LiveKit data packets carry only refresh hints; their contents never become displayed messages. A single in-flight refresh drains catch-up pages, merges by persisted ID and retries via visible-page polling every ten seconds. Views share one mounted Room/provider, audio renderers, device state, volume state and chat draft. Tab changes do not reconnect media. A separate entry action opens Chat without token issuance or microphone access.

Reads exclude records aged 30 days or more, independently from physical cleanup. A daily Vercel Cron invokes an endpoint protected by a distinct `CRON_SECRET`. Hobby scheduling is approximate and does not retry failed invocations. Cron registration takes effect only on a future authorized Production deployment; Preview cron is not supported. Preview cleanup is an explicit operator command. Expired rows remain inaccessible even if cleanup fails; provider backups may outlive deletion under provider policy.

See [database operations](../CHAT-STORAGE.md) for verified provisioning, migration, retention and recovery steps. This decision supersedes the ephemeral-chat parts of ADR-009/010, not their media or security decisions.
