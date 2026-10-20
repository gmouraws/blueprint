# Setup, preview and recovery

## Local environment

Use the repository's Node 22 baseline (22.17+); npm ci installs the pinned lockfile. livekit-client 2.22.0 is pinned because 2.23.0 introduces a dependency requiring Node 22.22, above the existing local baseline. No dependency downgrade changes media architecture.

1. Copy .env.example to .env.local. Replace every placeholder. Never commit .env.local or paste its contents into a PR/chat.
2. Generate SESSION_SECRET locally: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Keep it private.
3. Choose a unique shared ROOM_PASSWORD of at least 16 characters and distribute privately to the invited friends.
4. Set APP_ORIGIN=http://localhost:3000 for npm run dev. Exact origin matching matters; use that URL in the browser.
5. Run npm ci, then npm run dev. Without credentials the app displays configuration required, with no fake connections.

## LiveKit Cloud (free Build plan)

1. Sign in at https://cloud.livekit.io and create a project on **Build ($0/month)**. Do not select paid plans or add paid features. Current plan details: https://livekit.io/pricing . Quotas are finite; screen sharing consumes data transfer and participant minutes. Usage beyond the free allowance may stop service; do not enable an upgrade without owner approval.
2. In project settings/API keys, obtain the project WebSocket URL, API key and secret. Set LIVEKIT_URL (wss://…livekit.cloud), LIVEKIT_API_KEY and LIVEKIT_API_SECRET server-side.
3. Set LIVEKIT_ROOM_NAME=blueprint-room-preview for preview/local testing. It is a fixed server-side name, not a client choice. Use a separate Cloud project for production if the free account allows it, or at least a distinct room name such as blueprint-room-production. Preview participants must never join the live production room.
4. Do not enable agents, recording, egress, transcription or AI. The app creates/recreates the room with an eight-person cap. If an existing room has a different cap (including the former five-person limit), let everyone leave and wait for automatic deletion, or delete the empty room in the intended project, then retry. Never remove the cap to fix admission.

## Upstash Redis (durable rate limits only)

1. Create an account at https://console.upstash.com and a **Free**, single-region Redis database near the Vercel functions. The published free tier is $0 with 500K commands/month and 250MB storage at implementation time; verify https://upstash.com/pricing/redis before setup.
2. Copy its REST URL and REST token into UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Use the single-region database for authoritative counters. Do not configure eventual-consistency multi-region limits.
3. Keep the free tier; do not add billing, enable auto-upgrades or buy a plan. Each login performs multiple Redis operations; exhausted quotas/service failure block authentication. Existing media calls do not depend on Redis after connection. Review usage privately in the provider console.
4. No chat history is stored there. Only expiring rate-limit counters with hashed identifiers are used. Rate-limit analytics is disabled.

## Environment variable reference

All nine values are **server-only environment variables**. Do not prefix any with NEXT_PUBLIC_. The authenticated token response intentionally reveals LIVEKIT_URL, nickname, participant identity and a short-lived participant token; it never includes the API secret or shared password.

- APP_ORIGIN: exact allowed app origin, without trailing slash. Local HTTP localhost is supported; deployed app must use HTTPS.
- ROOM_PASSWORD: shared password, 16–256 characters.
- SESSION_SECRET: cryptographically random signing secret, at least 32 characters. Rotation invalidates cookies.
- LIVEKIT_URL: project wss://…livekit.cloud URL.
- LIVEKIT_API_KEY: project API key; server only even though it is not the secret.
- LIVEKIT_API_SECRET: project API secret; never disclose.
- LIVEKIT_ROOM_NAME: one lowercase server-controlled name per environment, 3–64 characters.
- UPSTASH_REDIS_REST_URL: HTTPS database REST endpoint.
- UPSTASH_REDIS_REST_TOKEN: database REST credential; never disclose.

Vercel supplies VERCEL, VERCEL_URL and VERCEL_BRANCH_URL; do not spoof these locally. The generated deployment/branch URLs are allowed origins automatically. APP_ORIGIN remains the exact custom-domain/local origin.

## Existing Vercel integration

The existing project is blueprint (prj_hNhWNMGea9fQLySMr6CfR92BodNS), associated with blueprint.app.br; retain it. No DNS, domain or production project settings need to change. There is no static-export setting; Next.js functions serve the API. Production remains main. GitHub Actions runs quality gates, not deployment commands.

1. Push/review the feature PR. The existing Git integration creates a **preview**; never use --prod or promote during this phase.
2. In this project's Settings → Environment Variables, set the nine values for **Preview** (optionally scoped to this branch). Use the preview room name and isolated secrets. APP_ORIGIN can be the exact preview alias; generated Vercel deployment origins are also accepted.
3. Redeploy that **preview commit** after setting the variables. Do not change production env or deploy production yet. If preview protection requests Vercel authentication, invited testers need authorized access; do not disable protection to let automation in.
4. Complete docs/ACCEPTANCE.md on real Chrome/Edge machines. Free-plan screen-audio availability and ninth-participant rejection must be verified, not inferred from unit tests.
5. Only after preview approval, the owner configures the separate **Production** values (APP_ORIGIN=https://blueprint.app.br, a separate room name and secrets), then explicitly approves merging. Existing Git integration replaces the root website on main. Verify domain/HTTPS, denied indexing, auth, microphone and screen capture after deployment. No manual release or DNS change is required.

No LiveKit or Upstash account/resources were created by this implementation. Credentials are not present in the repository. The configuration-required preview is intentional until the owner supplies them.

## Verification and limits

npm run check runs lint, route type generation, TypeScript and focused security tests. npm run build performs the optimized Next build and verifies expected routes, removal of public editorial output/analytics and absence of configured secret values in browser assets. CI supplies five harmless canaries to verify isolation without real credentials. npm run test:e2e runs Chromium/axe tests; network fixtures cover UI errors and the real disconnected room layout, **not successful media connectivity**. It never connects to a real LiveKit service with test credentials.

The production dependency audit is clean at implementation time. npm reports five inherited high-severity development-tool findings through eslint-config-next → fast-glob → micromatch → braces (GHSA-vfj7-8cjw-p6xm), without a compatible patched version reported. Do not force-downgrade the Next ESLint configuration to another major. Recheck before production.

## Recovery

Original current-main commit: `9cebdeb8e924c69ca16d92be8bb2774c217f682e` (before the private room replacement). There were no uncommitted user files at the start. Git history is preserved.

To inspect the former site without changing production: create a separate local branch from that SHA (`git switch -c codex/recover-public-site 9cebdeb8e924c69ca16d92be8bb2774c217f682e`). To restore production after an eventual merge, revert the replacement PR's actual merge commit with `git revert -m 1 <merge-commit-sha>` on a new branch, review its PR, then merge through the normal Git integration. For a squash merge use `git revert <squash-sha>` instead. Do not reset/force-push main. Verify the restored site before deleting private-room provider credentials/resources.
