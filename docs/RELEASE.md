# Blueprint Room production release

## Authorization and scope

The owner authorized merging PR #8 into main and replacing the public website through the existing Vercel Git integration, project blueprint (`prj_hNhWNMGea9fQLySMr6CfR92BodNS`). This includes the eight-participant server cap, configuration fixes and compact entry screen. No other project, DNS change, paid plan or duplicate manual deployment is included.

The owner reported that Preview entry works after correcting ROOM_PASSWORD. All nine required variable names were independently confirmed in the Production scope. Production APP_ORIGIN was aligned with the existing canonical www domain before release. The environment variables are stored as write-only Secrets: distinct Production room/session values are owner-confirmed, not independently compared. No secret values were exposed.

Production approval explicitly does not mean multi-user voice, screen sharing, screen audio, concurrent ninth-participant rejection, reconnection or device cleanup have passed real-device acceptance. Keep those checks open in docs/ACCEPTANCE.md. The PR records automated and post-deployment verification separately from those manual checks.

## Canonical destination

Preserve the existing redirects: HTTP → HTTPS and blueprint.app.br → www.blueprint.app.br. The canonical application origin is https://www.blueprint.app.br. APP_ORIGIN must match that exact origin; do not loosen origin checks or alter DNS to accommodate a mismatch.

## Recorded rollback target

Immediately before this release, the canonical domain served the public editorial website from:

- Commit: `9cebdeb8e924c69ca16d92be8bb2774c217f682e`.
- Vercel deployment: `dpl_FWQZG6pmRStfz2XbhsjrQXaKebXP` (READY, production).
- Deployment URL: https://blueprint-27lfhdp61-gmouraws-8238s-projects.vercel.app.

For an urgent recovery, use this existing project's Vercel rollback action to restore that recorded deployment, then verify the canonical domain. A Vercel rollback can stop automatic production domain assignment; explicitly check the project's promotion/auto-assignment state before a later release.

For durable source recovery, create a branch from current main and revert PR #8's actual merge commit (`git revert -m 1 <merge-sha>` for a merge commit, or `git revert <squash-sha>` for a squash). Review and merge that recovery PR normally; never reset or force-push main. Do not delete provider resources or rotate credentials as part of a website rollback unless separately authorized.

These are release preparation and recovery records, not a claim that deployment or real-media validation has completed. The PR contains the final deployment outcome.

## Two-room/image release (PR #10)

After reviewing the Preview delivery, the owner explicitly authorized publishing this extension to Production. Release through the existing Git integration after PR checks pass; do not create a duplicate manual deployment or change DNS, paid plans or unrelated projects. The earlier public-site recovery record above remains historical.

The immediate rollback target, recorded before this release, is the PR #9 Room baseline:

- Commit: `e9eb3e29a6e19fe50413b933579e4e10aeb19f35`.
- READY Production deployment: `dpl_3bMTrFP3ncasGvuwfK5NxCQqKP9K`.
- URL: https://blueprint-biazh92j2-gmouraws-8238s-projects.vercel.app.

Production preparation creates a separate private Blob store on the existing Hobby plan, binds `BLOB_ENVIRONMENT=production`, and applies migration 002 transactionally to the Production-bound Neon database. See CHAT-STORAGE.md for verified resource state. Existing session, origin and rate-limit protections remain in effect; the voice limit stays eight across both rooms combined.

To recover urgently, roll back this Vercel project to the deployment above and verify the canonical domain. Check automatic domain assignment before the next release. For durable source recovery, revert PR #10's actual merge commit on a recovery branch and merge a normal PR; never rewrite main. Application rollback does not delete or reverse the database migration, history or Blob objects. Old and new deployments use different LiveKit room names, so clients need to reload/rejoin after recovery. Maintain image retention even if the older application is restored.

Automated tests and Preview image persistence passed. Hosted token issuance and leave endpoints returned 200, but a connected Cloud peer was not observed in the in-app browser. Physical-device voice/output routing, room switching with active media, Cloud ninth-participant concurrency, revoked-token reuse and sustained screen quality remain manual acceptance items. Production authorization does not mark those tests passed. Record the actual deployment, canonical-domain and authenticated verification results in PR #10 after release.
