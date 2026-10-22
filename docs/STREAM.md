The normal product is stream-only as approved in ADR 025. `/` is a media-free entry; `/admin` retains account and invitation administration. Discovery does not allocate media connections.

# Guest transmission operations

The approved `/stream` experiment is separate from member rooms/chat. It uses existing LiveKit and Upstash configuration and an environment-specific namespace; no Neon migration, new infrastructure or paid service is needed. Windows 0.1.5 adds the isolated native handoff described in ADR 022.

## Owner workflow

1. Sign in at `/admin`, open **Meu perfil → Convites para transmissão sem conta**.
2. Choose **Somente assistir** or **Transmitir e assistir**, and validity. Create/copy the private link before closing the dialog; existing secrets cannot be recovered from the server.
3. Send it privately. Anyone holding it can access that space; it is not an identity check. Guests see streams directly without an entry form. Sharing still requires **Selecionar tela** and the browser's capture confirmation.
4. **Atualizar convites** lists current invitations; **Revogar** denies their sessions and requests provider disconnection. Retry if cleanup is pending. Derived viewer links are revoked with their parent.

Eight connections maximum in this streaming space; publisher + viewer uses one connection. Multiple tabs sharing a guest cookie replace the earlier connection. Different browsers/devices consume separate slots. Leaving stops tracks and releases the connection; a still-valid browser session can reopen. Member APIs never accept the guest cookie.

## Persistent owner-managed invitation

The owner may explicitly create one no-expiry share/watch pair under **Link persistente · Discord**. Copy is available after creation because only this new pair uses purpose-separated server-key derivation. Existing expiring secrets remain unrecoverable. Rotation durably revokes the old pair before replacement; pending provider cleanup prevents replacement. Sessions and media tokens remain short-lived. See ADR 023.

## Optional Discord

Automatic announcements use the existing incoming webhook. The separate owner-approved `/blueprint` HTTP command uses `/api/discord/interactions`; see DISCORD.md for exact setup. Never use `/stream` or `/api/stream` as the Interactions Endpoint.

Only after explicit owner authorization of the destination, set server-only `DISCORD_STREAM_WEBHOOK_URL` to the target Discord webhook URL and `DISCORD_STREAM_ANNOUNCEMENTS_ENABLED=true` in the intended environment, then deploy. Keep Preview and Production targets isolated. Never paste the credential into logs/PRs. No Discord login, nickname or mass mentions are used. The optional slash command is independently configured.

The server checks actual screen publication before sending a neutral announcement with a read-only one-hour-or-shorter invitation. The signed LiveKit endpoint `/api/stream/events` and provider reconciliation track starts/ends independently of the browser. A 20-second absence tolerance absorbs brief reconnects/replacements. End updates the stored original message and sends one end notice. Safe retries cover edits/429; ambiguous POSTs can omit a notice rather than duplicate it. Old announcements have no stored IDs. See ADR 024 and DISCORD.md for setup and limitations.

## Verification and limits

Discord-sourced guest sessions carry a bounded display label from the signed interaction, through individual short-lived entry/handoff tickets. Direct shared links remain anonymous; invitation records never carry personal names. LiveKit token names, stream discovery, viewer/audio labels and the start/end journal reuse the session label. Discord content escapes Markdown and disables all mentions.

Per-stream viewer counts use the receiving SDK's confirmed screen-video subscription, not a click or room membership. A serialized report writes only that track SID to a server-controlled participant attribute; guest tokens still cannot update their own metadata. Discovery counts ACTIVE, known admitted connections with the matching SID, excludes the publisher and ignores audio-only/idle peers. Stop/switch/unsubscribe clears the report; provider departure/revocation removes the connection. If provider removal fails, a still-active confirmed viewer remains counted until removal succeeds. Counter reports have a separate rate-limit budget from session authorization. No additional media connection, heartbeat or infrastructure. Existing discovery refreshes visible counts every ten seconds; API/provider failures can delay reports/count updates, retried on subsequent subscription events/discovery. These are informational client-confirmed counters, not independent server proof of playback or unique people. Separate admissions may count separately; normal same-cookie replacement rules remain. Counts never grant access or affect capacity.

Automated checks cover capability hashes/expiry/revocation/derived invites, strict owner access, scoped cookies, source grants, eight-person concurrency, stale connection cleanup, lost locks, provider failures, no microphone capture, fragment removal, responsive accessibility and announcement deduplication. The transport fixture uses real local LiveKit with synthetic canvas/audio; it does not prove physical audibility or hosted Cloud revocation.

Browser screen audio depends on the source/browser. System audio can include Discord; this flow must not claim process isolation. On Windows, opening a private invitation attempts the installed client once before browser media joins. **Abrir no aplicativo**, **Continuar no navegador** and the verified download remain available if blocked. A one-use 60-second code opens the isolated transmission window; permanent invites never enter the native URL. No timeout claims the app is absent. Install 0.1.6 for the corrected Windows protocol association and shutdown lifecycle. Native application audio is experimental, explicitly selected, and requires Windows build 20348 or later. No audio mode or capture is selected automatically.

Expiry blocks HTTP/token issuance immediately. Active clients check every 15 seconds and stop locally; the server reconciles expired media then and in the existing daily cleanup. Exact background disconnect timing is not guaranteed during an outage or with no active requests. Failed provider cleanup is retained for retry. See ADR 021.

Before broad use, test two real browsers: watch/share links, ninth admission, selected audio, browser picker cancellation/stop, room re-entry, expiry/revocation while connected, and Cloud rejection of revoked credentials. Check Chrome/Edge screen-audio scope with Discord separately. The owner authorized Production announcements after configuring the webhook. Real channel delivery has not been exercised by the desktop test fixtures.

## Recovery

Pre-release main: `b187a2cc64d6992a9020ec11b526d76e97817114`. Production recovery deployment: `[identifier retained in provider dashboard]`. No data migrations or installer changes. Disable Discord first if later enabled; revoke guest invitations and confirm media cleanup before reverting the route, since a web rollback cannot disconnect existing LiveKit peers. Never delete the ledger while active/pending identities remain. Revert through a normal PR or use the recorded Vercel deployment for urgent recovery, verify canonical assignment, and preserve account/history/storage data.
