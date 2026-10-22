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

## Optional pinned opening panel

No command re-registration, new environment variables, bot scope/token, gateway process or installer update is required. `/blueprint` keeps its existing private Transmitir/Assistir response and Windows/browser handoff. Only Discord server owners/administrators see an additional **Publicar painel** button; the handler requires the signed current member's `ADMINISTRATOR` permission (bit 8), including a fresh check when clicked. Manage Server/Manage Messages alone do not authorize publishing.

1. In server `466392379667120129`, open channel `1562594072282271744` with the server owner/administrator account.
2. Invoke the existing `/blueprint` command. Its response is private. Click **Publicar painel** once to explicitly create a public interaction response in this channel. Nothing is posted by builds, deployments or ordinary `/blueprint` use.
3. The public message says **Blueprint — compartilhe sua tela com a galera**, followed by **Clique abaixo para transmitir ou assistir.**, with **🎥 Abrir Blueprint**. Use Discord's message menu → **Pin Message / Fixar mensagem** and confirm. Pinning remains manual and requires the appropriate Discord permission.
4. Anyone in the allowed channel can click **🎥 Abrir Blueprint**. Only that person receives the current private **Transmitir**/**Assistir** links and the existing Windows/browser opening flow. The public message is never edited to include those links.

The panel button uses stable non-secret `blueprint:panel:open:v1`; setup uses `blueprint:panel:publish:v1`. The public panel contains no invitation credential or URL, and publishing it does not read/create invitations. Every opening reads the currently configured persistent pair, so rotation needs no panel replacement. Missing/revoked invitations return an unavailable private response; configure/rotate links through the existing Blueprint owner administration. Existing private responses remain governed by invitation revocation, rather than being silently rewritten.

Signature freshness, exact application/guild/channel restrictions, replay claims, mention suppression and the existing per-user Discord rate limit cover both component actions. Publication acknowledges publicly only after the signed administrator/channel checks; rate/dependency failures produce a safe failure response without links. Other clicks always acknowledge privately. Provider response failures are logged only as a fixed category; do not assume a panel was delivered if Discord reports failure. Remove an unwanted/duplicate panel manually in Discord. Reverting this extension leaves the panel message in Discord but disables its button; delete/unpin it if rolling back.

Sources: [Discord interaction responses and deadlines](https://docs.discord.com/developers/interactions/receiving-and-responding), [interactive buttons](https://docs.discord.com/developers/components/reference#button), [permissions](https://docs.discord.com/developers/topics/permissions).

## Stream lifecycle webhook

In the Production LiveKit project, create a webhook for `https://www.blueprint.app.br/api/stream/events`, selecting the signing key matching Production LIVEKIT_API_KEY. No new environment variables or bot token are needed. The owner confirmed creating this webhook. After deployment, use LiveKit's Send a test event and inspect its delivery HTTP result; 204 confirms a valid signed payload was accepted (a synthetic/unrelated room does not announce anything). Missing/invalid signatures return 401. Test a real share/stop separately to verify Discord delivery and editing.

The server retains each new start message ID. After 20 seconds of provider-confirmed absence, it edits the original to remove the viewing link and posts Transmissão X encerrada. Replacements/reconnects within that grace period are one lifecycle. Failures are recorded safely; ambiguous POSTs are not blindly retried. Older announcements lack IDs and cannot be edited retroactively. See ADR 024 for bounded retries and delivery limitations.

Do not send a public publishing invitation. Ephemeral responses are private to the invoking user but can still be copied; possession grants access until revocation. Existing webhook announcements carry only short-lived watch-only access and are the sole automatic announcements.

## Verification and recovery

Automated tests use generated Ed25519 keys and mocked Discord HTTP, not production credentials. They verify raw signature tampering/freshness, PING, application/guild/channel restrictions, deferred acknowledgement, ephemeral response, replay/rate failures, named registration, and no permanent invite creation per command. Persistent tests cover short sessions/tokens, role separation, revocation, rotation/provider failure, secret hashing and key changes. Real Portal validation/command invocation needs external setup and must be reported separately.

To disable commands, remove the allowed-channel configuration and redeploy, or restrict the app in Discord Server Settings → Integrations. To stop shared access, revoke the persistent invitation and confirm cleanup. Keep the webhook settings unchanged if announcements should continue for other invitations. Reverting code alone does not disconnect existing LiveKit clients; revoke and reconcile first. No account/chat migration is introduced.
