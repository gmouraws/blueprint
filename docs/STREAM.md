# Guest transmission operations

The approved `/stream` experiment is separate from member rooms/chat. It uses existing LiveKit and Upstash configuration and an environment-specific namespace; no Neon migration, new infrastructure or paid service is needed. Windows 0.1.5 adds the isolated native handoff described in ADR 022.

## Owner workflow

1. Sign in normally at `/`, open **Meu perfil → Convites para transmissão sem conta**.
2. Choose **Somente assistir** or **Transmitir e assistir**, and validity. Create/copy the private link before closing the dialog; existing secrets cannot be recovered from the server.
3. Send it privately. Anyone holding it can access that space; it is not an identity check. Guests see streams directly without an entry form. Sharing still requires **Selecionar tela** and the browser's capture confirmation.
4. **Atualizar convites** lists current invitations; **Revogar** denies their sessions and requests provider disconnection. Retry if cleanup is pending. Derived viewer links are revoked with their parent.

Eight connections maximum in this streaming space; publisher + viewer uses one connection. Multiple tabs sharing a guest cookie replace the earlier connection. Different browsers/devices consume separate slots. Leaving stops tracks and releases the connection; a still-valid browser session can reopen. Member APIs never accept the guest cookie.

## Optional Discord

This implementation uses an incoming channel webhook, not Discord Interactions. It does not read an Application ID or Public Key and has no Interactions Endpoint URL. Leave that field empty in the Developer Portal; do not configure `/stream` or `/api/stream` as an interactions endpoint. The owner-created Discord application can remain unused until a separately approved command integration. Do not add unused application identifier variables to Vercel.

Only after explicit owner authorization of the destination, set server-only `DISCORD_STREAM_WEBHOOK_URL` to the target Discord webhook URL and `DISCORD_STREAM_ANNOUNCEMENTS_ENABLED=true` in the intended environment, then deploy. Keep Preview and Production targets isolated. Never paste the credential into logs/PRs. No slash command, Discord login, nickname or mass mentions are used.

The server checks actual screen publication before sending a neutral announcement with a read-only one-hour-or-shorter invitation. Reconnects/replacements do not repeat it. Network ambiguity can intentionally omit a notice; failures never stop media. Do not resend automatically. A stopped screen and a later explicit new share permit a new notice.

## Verification and limits

Automated checks cover capability hashes/expiry/revocation/derived invites, strict owner access, scoped cookies, source grants, eight-person concurrency, stale connection cleanup, lost locks, provider failures, no microphone capture, fragment removal, responsive accessibility and announcement deduplication. The transport fixture uses real local LiveKit with synthetic canvas/audio; it does not prove physical audibility or hosted Cloud revocation.

Browser screen audio depends on the source/browser. System audio can include Discord; this flow must not claim process isolation. Windows 0.1.5 also supports guest links: click **Abrir no aplicativo** after opening the private invitation. A one-use 60-second code opens a separate transmission window; **Continuar no navegador** remains available. Install the Production client first. Native application audio is experimental, explicitly selected, and requires Windows build 20348 or later. System audio can include unrelated applications; no audio mode is selected automatically.

Expiry blocks HTTP/token issuance immediately. Active clients check every 15 seconds and stop locally; the server reconciles expired media then and in the existing daily cleanup. Exact background disconnect timing is not guaranteed during an outage or with no active requests. Failed provider cleanup is retained for retry. See ADR 021.

Before broad use, test two real browsers: watch/share links, ninth admission, selected audio, browser picker cancellation/stop, room re-entry, expiry/revocation while connected, and Cloud rejection of revoked credentials. Check Chrome/Edge screen-audio scope with Discord separately. The owner authorized Production announcements after configuring the webhook. Real channel delivery has not been exercised by the desktop test fixtures.

## Recovery

Pre-release main: `b187a2cc64d6992a9020ec11b526d76e97817114`. Production recovery deployment: `dpl_FVnbRmJUfRQHkh2rgDXPGRfegcBh`. No data migrations or installer changes. Disable Discord first if later enabled; revoke guest invitations and confirm media cleanup before reverting the route, since a web rollback cannot disconnect existing LiveKit peers. Never delete the ledger while active/pending identities remain. Revert through a normal PR or use the recorded Vercel deployment for urgent recovery, verify canonical assignment, and preserve account/history/storage data.
