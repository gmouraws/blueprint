# ADR 015: Sender-owned deletion and bounded reconciliation

Status: accepted; the owner authorized the Production release in PR #12.

## Decision

Extend the existing authenticated chat endpoint with DELETE. The signed session UUID is the only ownership authority. A nickname is display text; there is no account recovery or cross-device ownership. Remembered access keeps its UUID until expiry, password rotation or forgetting access. A later password login creates a new UUID even with the same nickname.

Migration 003 adds a deletion function, content-free message tombstones and a small deletion cursor table. A transaction verifies environment and sender, revokes attachment access, removes text/image content and records the change under the existing message-write advisory lock. Removing an image keeps its text; an image-only message is removed entirely. Repeated requests are safe. Tombstones retain only the existing identity/idempotency metadata until normal 30-day expiry, preventing delayed send retries from restoring deleted content.

History reads use one repeatable-read snapshot for messages and deletion cursors. The existing ten-second visible-page poll and LiveKit refresh hint carry changes to voice and chat-only clients, including messages outside the newest history page. Local tombstones override late history responses. This is eventual client reconciliation, not instantaneous remote erasure; offline clients reconcile when visible/online again. Downloads reject detached/deleted images immediately. Copies already saved by recipients cannot be recalled.

## Storage and operations

Blob deletion runs only after the database has revoked access. Both the raw upload and normalized image are removed; failures preserve the existing `deleting` row for retry. The bounded cleanup batch continues past individual failures. A cleanup marker remains through the original one-hour upload-token window so a replayed raw upload can be removed later. The existing cleanup endpoint/CLI handles retries, orphaned uploads and retention; no queue, service or dependency is added.

Preview has no scheduled Vercel cron: operators must run cleanup there periodically and after restoring failed storage. Production has received migration 003 and uses its existing daily cleanup after the authorized PR #12 deployment. Monitor failures and repeat batches for backlogs. Application visibility is independent of cleanup availability and provider backup retention.

## Compatibility and rollout

Apply migration 003 to the intended environment before its application deployment; never relabel a database. It is repeatable, preserves existing messages and requires no new variables. Reload clients after deployment to receive deletion reconciliation. Earlier application versions do not understand tombstones; after deletion has been used, prefer a forward fix over rolling back to a reader that lacks `deleted_at` filtering. Do not reverse the migration or restore deleted content during rollback.
