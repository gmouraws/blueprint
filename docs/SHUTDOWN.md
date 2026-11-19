# Operational shutdown — 2026-11-19

The owner authorized stopping Blueprint usage, integrations, scheduled work and paid renewals while preserving source, domain registration, accounts, records and files. Scope is exclusively `gmouraws/blueprint` and its confirmed dedicated resources. This is a partial shutdown: outstanding provider actions below must not be mistaken for completed work.

## Confirmed actions

- Paused the existing Vercel `blueprint` project. Canonical/apex domains and the current direct deployment return `503 DEPLOYMENT_PAUSED`. Application/API execution and private installer delivery through that Production deployment are blocked.
- Vercel accepted `previewDeploymentsDisabled=true`, `autoAssignCustomDomains=false` and Ignored Build Step `exit 0`. No redeployment was created. These settings guard future Git builds; they do not erase or disable every historical deployment.
- Set `DISCORD_STREAM_ANNOUNCEMENTS_ENABLED=false` in Production and Preview, and cleared Production `DISCORD_ALLOWED_CHANNEL_IDS`. No messages were sent. These settings apply to future builds only; historical deployments retain their environment snapshots.
- Disabled both Neon compute endpoints for `blueprint-room-production` and `blueprint-room-preview`. Provider responses confirm `disabled=true`, `current_state=idle`. Databases, branches and stored records were preserved. The Vercel-managed Neon integration reports plan `free_v3` / Free.
- This commit removes automatic workflow triggers and makes all three workflow jobs unconditionally skip. The cron declaration is empty. This does not change the already-deployed Vercel cron schedule; disable that scheduler separately.
- No projects, databases, objects, domains, accounts or shared credentials were deleted or revoked. No application/media code was changed.

## Evidence and unresolved work

- Upstash's 2026-11-19 alert explicitly names `blueprint-room` and **90% of 500,000 monthly commands**. This is command quota, not evidence of storage pressure or a charge. Live Redis metrics, plan, auto-upgrade and billing were inaccessible.
- Historical deployment and Preview URLs remain behind Vercel Authentication; this is not proof that a previously authenticated Vercel user cannot execute them. Project-wide firewall read/update failed (`Seawall Config not found`). Replacing unknown firewall configuration was rejected by automatic approval review and was not performed. Add a reversible deny-all rule without replacing existing rules, or otherwise disable historical deployments through supported provider controls.
- LiveKit has no authenticated management connection in this session. Active participants/publications, webhook configuration, API-key exclusivity, subscription and renewals are unverified. Stop active Blueprint sessions and disable its webhook at the provider. Revoke only confirmed Blueprint-exclusive signing keys to reject cached/old media credentials; never revoke a shared key. A paused web application alone does not terminate existing media sessions.
- Streaming invitations were not modified in Redis. Revoke all Blueprint invitations and reconcile connected identities before reactivation. Existing permanent invitation secrets must not become usable merely by unpausing.
- Disable Blueprint's existing Vercel daily `/api/chat/cleanup` cron (`0 5 * * *`) in Settings → Cron Jobs. Its Production endpoint is paused, but the scheduler toggle was not accessible. Cleanup is intentionally suspended: retained expired data may occupy storage until cleanup is deliberately resumed.
- Disable Discord app usage/panel actions in the authorized server's integration settings and disable the Blueprint LiveKit webhook. The paused interactions endpoint cannot handle commands, but the command/panel registrations were not removed. Do not send shutdown announcements.
- Vercel billing returned `costs_not_found`; no zero-cost claim is justified. The existing Production private Blob store reports billingState `active`, one connected Blueprint project and no exceeded usage quota. Stored attachments/installers remain. Blob storage charges, LiveKit/Upstash/Resend plans, historical charges and renewals require dashboard review. Do not cancel a shared account plan or domain renewal.
- No local Blueprint Codex automation definition was found. GitHub source workflows have no periodic schedule; repository-wide Actions disable, Git disconnect and outstanding-run cancellation require dashboard access if desired beyond this commit's trigger guard.

## Verification

Operational checks only; no build or broad regression suite. Production homepage, stream admission/discovery, Discord interactions, LiveKit callback, cleanup and Windows download should all return the platform pause response before application execution. Old/Preview URLs were checked only anonymously and redirected to Vercel login. No real Windows connection, active media disconnection, invitation revocation or end-to-end billing shutdown is claimed.

## Recovery

Last application baseline: `97d03acf92e4e475f018bc31a7aa07da082e9d76` (PR #39), Windows private installer 0.1.8. Retain the existing READY Production deployment and private objects; do not rebuild or publish automatically during shutdown.

Reactivate only on a new explicit owner instruction. First finish provider inventory, rotate/revoke stale invitations and reconcile media while announcements remain disabled. Re-enable the two existing Neon endpoints, verify provider plans/quotas and any replacement dedicated credentials, restore the intended workflow and cron definitions from the baseline, and remove the Ignored Build Step/Preview guard deliberately. Restore only authorized Discord channel/announcement settings, validate the signed webhook, then deploy/re-enable scheduling and unpause the project. Remove only the shutdown-specific firewall rule if one was added manually. Verify authentication, invite isolation, private downloads and media limits before distributing new links. Resume retention cleanup intentionally; it can permanently remove expired history/attachments under the established policy.
