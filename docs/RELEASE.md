# Blueprint Room production release

## Accounts cutover preparation (PR #15)

The owner authorized the accounts release after successful Preview OTP login. Resend reports the sender domain Verified and the authorized recipient's latest authentication message Delivered; the owner then completed login. Preview owner controls, preferences and chat history were verified, including a new account-owned message surviving reload. Physical multi-user audio and Cloud revocation acceptance remain separate checks.

Before migration, the Production rollback target is commit `0a725223bcaf5dcdf5d59e0b167f7808354c86c6`, READY deployment `dpl_27L6YyZ4rPt3HFEYSJnbGr2RdAHV`. Neon Production project `green-poetry-18415626`, branch `br-sparkling-math-b8kvnjp0`, has a verified manual snapshot named `main at 2026-10-21 16:13:03 UTC (manual)`, with no expiry shown. It was created on the existing Free plan without upgrading. This is a recovery point, not evidence that the cutover is complete.

Migration 004 does not delete history or infer legacy ownership, but its insertion guards make the old shared-password writer incompatible. Prefer a forward fix after cutover. A deployment-only rollback is insufficient: coordinate database recovery under maintenance, preserve post-snapshot data and deletion tombstones, and reconcile private objects before reopening access. Do not blindly restore the snapshot after new writes because doing so could discard new data or resurrect deleted content. Keep the canonical origin and use a distinct account media namespace so retained legacy deployments cannot access the new rooms. The PR records final migration/deployment/acceptance results.

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

## Deletion, audio controls and membership notices (PR #12)

The owner explicitly authorized this Production release after Preview delivery. It includes sender-owned message/image deletion, native microphone noise-suppression settings, screen-audio/deafen refinements and visual entry/exit notices restricted to the joined voice room. The combined eight-person voice limit is unchanged. Publish through the existing Git integration after checks pass; no duplicate deployment, DNS change, new resource or paid plan is needed.

Immediately before this release, the canonical domain was assigned to:

- Commit: `50739a9e186f8a4115f2e40be449b9ee31b7edf3` (PR #11).
- READY Production deployment: `dpl_DfVHbgt7veJfyz2o42Ur2cgto9Mt`.
- URL: https://blueprint-gpa12zn60-gmouraws-8238s-projects.vercel.app.

Migration 003 was applied transactionally to the isolated Production Neon database and metadata-verified before merging. No existing messages were deleted. The existing daily cleanup schedule was verified enabled in Vercel. This is not evidence of a completed cleanup invocation; hosted deletion and physical Blob cleanup remain acceptance checks.

**Recovery constraint:** earlier readers do not understand deletion tombstones. After any deletion has been used, prefer a forward fix that retains migration 003 and `deleted_at` filtering. Do not reverse the migration or restore deleted content. Before deletion is used, urgent application recovery may use the recorded Vercel deployment, followed by canonical-domain verification and checking automatic domain assignment. Any durable recovery must use a reviewed PR on current main, without rewriting history, and preserve deletion safeguards.

Reload open clients after deployment so they receive deletion reconciliation and membership notices. The final deployment/merge identifiers and public checks belong in PR #12. Real-device audio, hosted multi-user notifications and cross-client deletion/Blob cleanup remain separate from the passing automated tests and local synthetic LiveKit tests.

## Windows 0.1.3 and audio/settings refinement (PR #16)

Owner explicitly authorized the complete web release and public unsigned Windows test installer, without requiring manual Preview acceptance. No schema, credentials, origin, storage or retention changes are needed.

Pre-release recovery target: main `f16107498a57a33e6f645aa26cc163a9c4f15d4f`, READY Production deployment `dpl_GyfE5vBeyBK1pBspat1wrDKNMvhp`, canonical https://www.blueprint.app.br. Previous installer is private Production 0.1.2, SHA-256 `94d630b0d66af5f62d7e8f7b32edd90e511c07ecdf303c0f37241d3a199d264f`. There is no prior public Windows download to restore.

Recovery: set the Windows release manifest to null in a reviewed PR to hide downloads while preserving browser entry. For urgent web recovery, roll back this project to the recorded READY Production deployment and check canonical assignment; use a normal revert PR for durable recovery. Preserve all account preference keys/data. Never reverse migrations or reset history. An installed desktop client loads the hosted page; ask users to leave the call and restart after a web rollback. To recover the shell, exit via tray and reinstall the retained private 0.1.2 binary if available, preserving its Production profile. Do not overwrite published release assets; withdraw a defective release/download and issue a new version.

Automated CI/build/synthetic media evidence is separate from real audio, game, tray and multi-user acceptance. Record final deployment/release/hash evidence in the PR and release report.

### Published test release

PR #16 merged as `dc4cd411d631fa553b92eb2335e055ba1a575aed`. Vercel Production `dpl_5AwLwoGVdu3EqCshjFyKPnqXqDTD` is READY on the canonical domain. HTTPS/redirects, ready entry, and unauthenticated account/chat/token rejection were verified. Main Quality and Windows release workflows passed.

[Windows test release 0.1.3](https://github.com/gmouraws/blueprint/releases/tag/windows-v0.1.3) is a public prerelease targeting that merged commit. Published installer SHA-256: `8ce762966d206758027374f4c6f59c1147ed733ae572c3ca7281857faf76645e`. The actual public installer was downloaded and matched its published checksum; its extracted app confirmed version 0.1.3, the Production profile/canonical origin and no environment files. The extracted executable passed Windows startup, preload/security flags, protected-endpoint rejection, and injected-network-failure recovery/retry. The NSIS installation wizard and physical/multi-user audio remain unverified.

Local checks: 78 unit/integration, 21 browser, 10 Electron policy/lifecycle, and 6 focused synthetic LiveKit transport tests passed. Picker layout checks used 24 sources and emulated 100/125/150% scaling, not changes to the physical Windows display settings. Website download activation is a separate small manifest PR after this asset verification. Revert that manifest to null to hide it; the recovery targets above remain valid.

## Windows 0.1.4 process-audio release

The owner subsequently authorized publishing 0.1.4 to Production for manual testing, superseding the original private-only delivery. Release through normal PR checks and the existing Windows release/Vercel Git integrations. No schema, environment, authentication, storage or DNS changes are needed. The native adapter works with the current hosted application; the website change is the verified download manifest.

Pre-release baseline: main `9dbd31cfd80f6e143ac3104c3ade60497de46296`, Production `dpl_H9Cpdme2q7M5mGNSu33dzgqgjTB1`, https://www.blueprint.app.br. Recovery installer is public `windows-v0.1.3`, SHA-256 `8ce762966d206758027374f4c6f59c1147ed733ae572c3ca7281857faf76645e`.

Recovery: restore the 0.1.3 download manifest (or null to hide downloads) through a reviewed PR. Exit through the tray and reinstall 0.1.3 to recover the native shell; reverting a web deployment alone cannot replace an installed helper. Keep the Production profile, accounts and history. If urgent web rollback is needed, use the recorded deployment and verify domain auto-assignment. Never overwrite existing release assets. Application audio remains opt-in and experimental until real-user acceptance; a running old client must be exited before installing the update.

### Published 0.1.4 evidence

PR #20 merged as `b36632e0c211885a10b62c1a1ddfe55f72c7fb25`; main Quality and the Windows publication workflow passed. Vercel deployment `dpl_2BsrGQjViBJPXne46cHiKcrdfaZu` is READY on the canonical domain. Public entry, HTTPS redirects and unauthenticated endpoint rejection passed.

The actual [0.1.4 release](https://github.com/gmouraws/blueprint/releases/tag/windows-v0.1.4) installer was downloaded and matched its published SHA-256: `a030e1a3f860ca341e4705488a9be4e91e51532e7ea2ebbe1abce9daeaed68e0`. Extracted contents confirm version 0.1.4, Production/canonical origin, the native helper and no environment/test fixtures; the packaged helper reports supported on this Windows host. The existing running application prevented a separate packaged startup smoke test through single-instance handoff; the owner chose manual acceptance after release. No installed application was stopped.

Verification: 78 unit/integration, 21 browser and 15 desktop tests passed, plus production builds. Real Windows fixtures exposed 28 sources (all rendered), including 20 controlled windows and selection beyond the first page. Native and sandboxed Electron/local-LiveKit tests received selected/child process tones while excluding a second application and Electron playback. This is measured synthetic Windows audio, not a physical microphone, game or friends' Production call. Physical display scaling, installer wizard, long-running AV synchronization and real-user acceptance remain manual. Application audio stays experimental and off by default. The website manifest is enabled only after this published-asset verification.


## Windows guest transmission 0.1.5

Owner authorized installer publication and Production download update after checks. Baseline main: `3bdc00fd65c9a965b73d4beaad6d5691a56522cc`; recovery Vercel deployment: `dpl_HG6xEq4JCNy63ZMpzysQAFzsUpwG`. Recovery installer: `windows-v0.1.4`, SHA-256 `a030e1a3f860ca341e4705488a9be4e91e51532e7ea2ebbe1abce9daeaed68e0`.

Merge the desktop/web compatibility PR through Quality and Windows checks. The existing version-gated workflow builds/publishes 0.1.5 only after main Quality succeeds. Verify the downloaded release asset and checksum before a separate download-manifest update. Vercel Git integration deploys merged web commits; do not duplicate deployments.

No migrations, new environment variables or account changes. To recover, revert/hide the download manifest and restore the recorded web deployment via normal recovery. Installed clients are not replaced by a web rollback: instruct manual downgrade to 0.1.4. Revoke affected guest invitations and confirm provider cleanup before removing a running guest flow. Preserve Redis ledger and account/chat storage.

PR #23 merged as `bad081d9b51aa5ebad968649beb72b62f1644a99`; Quality, Windows installer and authorized publication workflows passed. The public Production-targeted 0.1.5 installer (112191361 bytes) was downloaded and matched both its checksum asset and GitHub asset digest: `91469f6ac305bf39ad8044865a748a824e04467c4a7f9e5a4db2270356dda6b5`. The download manifest now references those actual published assets. Real Windows isolated Electron tests verified the guest permission/IPC boundary, 28 picker sources and synthetic process-audio isolation through local LiveKit. The installation wizard, installed protocol association and friends' cloud calls still require manual verification. Packaged startup automation was not run because review identified a risk of forwarding to an existing single-instance application and interrupting its call.

## Persistent stream invitation and Discord command

Owner authorized Production after checks. Recovery baseline is main `bad081d9b51aa5ebad968649beb72b62f1644a99`, successful Vercel deployment `dpl_Lpk8ZUyQTCXJMcj1ogAhzaR3YHqK`. No database migration, account cutover or webhook change is required. Four optional public server variables are documented in DISCORD.md; the owner confirmed saving them in Production before this merge. Bot credentials are local registration-only, never runtime configuration.

Revoke persistent invitations and confirm media cleanup before reverting this feature: older code does not understand the persistent expiry marker. A web rollback alone cannot revoke connected media. Preserve Redis state, all accounts, attachments and history. Hide the Windows download by setting its manifest to null, or restore the prior verified 0.1.4 manifest; never overwrite release assets. Discord Portal validation, command registration and a real invocation remain external acceptance steps until verified; unsigned request rejection is independently verifiable after deployment.
