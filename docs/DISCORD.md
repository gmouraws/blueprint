# Discord /blueprint setup

Production Interactions Endpoint URL: `https://www.blueprint.app.br/api/discord/interactions`.

## Runtime configuration (Vercel Blueprint → Production)

- `DISCORD_APPLICATION_ID`: `1562592101659836516`.
- `DISCORD_PUBLIC_KEY`: the application's 64-character public key from General Information (already supplied by the owner; do not use a bot token here).
- `DISCORD_GUILD_ID`: `466392379667120129`.
- `DISCORD_ALLOWED_CHANNEL_IDS`: `1562594072282271744`. This is a comma-separated exact allowlist; other channels, threads and DMs are denied.

These are server configuration, never NEXT_PUBLIC variables. Keep the existing `DISCORD_STREAM_WEBHOOK_URL` and `DISCORD_STREAM_ANNOUNCEMENTS_ENABLED` unchanged: they control automatic screen announcements independently. The existing APP_ORIGIN must remain the canonical HTTPS origin. The current SESSION_SECRET is also used with purpose-separated HMAC for new persistent links; no new secret is required. Never print or paste secrets into chat/logs.

## Setup order

1. Save the four runtime variables in Production before the authorized Git deployment. If saved afterward, redeploy the current main commit once to load them; no duplicate deployment is needed if the merge already uses the new values.
2. In Discord Developer Portal → Blueprint Room → General Information, set the exact Interactions Endpoint URL above and save. Discord checks signed PING and invalid-signature rejection. No login, Discord redirect URI or webhook URL belongs in this field.
3. Under Installation, enable **Guild Install** and use only **applications.commands** in Default Install Settings. Install into the specified server using the generated install link. No bot scope, administrator permission, permission integer, privileged intents or continuously running process is required. The installer of the Discord app needs permission to manage/install apps in that server; ordinary command users do not need administrator access.
4. Register the guild command once from a trusted local shell: set `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID`, and `DISCORD_BOT_TOKEN` privately, then run `node scripts/register-discord-command.mjs`. Obtain the bot token from the application's Bot page; do not save it to Vercel, Git or command-line arguments. The script upserts only this app's CHAT_INPUT command named blueprint in the named guild; rerunning is safe and does not overwrite other commands. It does not start a bot.
5. Sign into Blueprint as the owner → Meu perfil → Convites para transmissão sem conta → Link persistente · Discord → Atualizar link persistente → Criar link sem expiração. Existing temporary links are not converted. Copiar link returns the share link; a separate read-only link is displayed for private distribution. Trocar link confirms revocation before replacement. Revogar disconnects derived guests; retry cleanup if the UI reports pending.
6. In the allowed channel, invoke `/blueprint`. Only the invoking user sees Transmitir/Assistir. The HTTPS invitation attempts Windows 0.1.6 handoff once, using a single-use short-lived ticket, before joining browser media. If blocked, use Abrir no aplicativo, Continuar no navegador or the published download. Installation cannot be detected reliably. Other platforms use the browser. Sharing always requires Selecionar tela and capture confirmation. Install 0.1.6 to receive the protocol-registration and shutdown fixes; a web deployment alone does not update the executable.

## Stream lifecycle webhook

In the Production LiveKit project, create a webhook for `https://www.blueprint.app.br/api/stream/events`, selecting the signing key matching Production LIVEKIT_API_KEY. No new environment variables or bot token are needed. The owner confirmed creating this webhook. After deployment, use LiveKit's Send a test event and inspect its delivery HTTP result; 204 confirms a valid signed payload was accepted (a synthetic/unrelated room does not announce anything). Missing/invalid signatures return 401. Test a real share/stop separately to verify Discord delivery and editing.

The server retains each new start message ID. After 20 seconds of provider-confirmed absence, it edits the original to remove the viewing link and posts Transmissão X encerrada. Replacements/reconnects within that grace period are one lifecycle. Failures are recorded safely; ambiguous POSTs are not blindly retried. Older announcements lack IDs and cannot be edited retroactively. See ADR 024 for bounded retries and delivery limitations.

Do not send a public publishing invitation. Ephemeral responses are private to the invoking user but can still be copied; possession grants access until revocation. Existing webhook announcements carry only short-lived watch-only access and are the sole automatic announcements.

## Verification and recovery

Automated tests use generated Ed25519 keys and mocked Discord HTTP, not production credentials. They verify raw signature tampering/freshness, PING, application/guild/channel restrictions, deferred acknowledgement, ephemeral response, replay/rate failures, named registration, and no permanent invite creation per command. Persistent tests cover short sessions/tokens, role separation, revocation, rotation/provider failure, secret hashing and key changes. Real Portal validation/command invocation needs external setup and must be reported separately.

To disable commands, remove the allowed-channel configuration and redeploy, or restrict the app in Discord Server Settings → Integrations. To stop shared access, revoke the persistent invitation and confirm cleanup. Keep the webhook settings unchanged if announcements should continue for other invitations. Reverting code alone does not disconnect existing LiveKit clients; revoke and reconcile first. No account/chat migration is introduced.
