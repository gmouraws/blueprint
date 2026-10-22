# ADR 023 — Owner-managed persistent stream invitation and guild command

Status: owner-approved implementation and Production release after checks.

Keep existing expiring invitations unchanged. The owner explicitly creates one persistent share/watch pair for this space. Both are revocable; the watch capability cannot publish. Sessions still expire within 12 hours and join tokens within 120 seconds. All existing guest/source/member boundaries and admission limits remain.

For this new pair only, derive 256-bit capabilities with HMAC-SHA256 under SESSION_SECRET, using a separate purpose/version/room/UUID/role domain. Store hashes, random IDs and the current pair's pointer, never plaintext capabilities. The owner copy action and signed Discord command reconstruct the configured pair server-side. Old random invitations cannot be recovered. Changing SESSION_SECRET invalidates persistent pairs; copy/configuration fails closed until the owner creates a new pair. This avoids an additional encryption key or secret stored in a client/config file.

Rotation first durably revokes the previous pair and requests provider cleanup, then creates a replacement only if cleanup succeeds. Provider failures remain pending and retryable; no new replacement is returned. New admissions fail immediately; existing background media retains ADR 021's reconciliation timing caveats. Do not rollback to code that does not recognize persistent expiry markers without first revoking/cleaning up these guests.

Discord HTTP requests verify Ed25519 over timestamp plus exact raw body, bound body size/time, and enforce a five-minute signature freshness window. PING needs no database. Slash command application/guild/channel/member/name/type are validated before acknowledging. An ephemeral deferred acknowledgement precedes Redis/provider work to respect Discord's three-second deadline; Next.js after() completes a bounded original-response edit. Redis suppresses replay and rate limits users. Failures do not disclose capabilities or stop streams.

The command reads the current pair, never creates one. Ephemeral link buttons open the HTTPS browser path with share/watch intent; opening/capture are separate explicit actions. Public automatic announcements continue through the existing webhook with short-lived watch-only invitations. No gateway bot, privileged intents, administrator permissions, public signup or new service.

Registration uses a named guild POST upsert, not bulk overwrite. The bot token is local registration-only and is not required by the deployed endpoint. Installation uses applications.commands only. Configuration is optional and fail-closed; missing Discord variables do not affect authenticated rooms or the existing webhook.

Owner-approved panel extension: `/blueprint` may show an additional setup button only to a signed Discord administrator (permission bit 8). Explicit publication creates a public interaction response with a stable non-secret button ID; the application itself still requests no administrator permission. Clicking that public button resolves the current pair in a new ephemeral response through the same signature, allowlist, replay and rate-limit boundary. Publishing reads no invitations and does not run during deployment. Rotation changes subsequent private responses without replacing the public panel. No command schema, bot token, database or infrastructure change is needed.

Sources: [Discord interactions](https://docs.discord.com/developers/interactions/receiving-and-responding), [guild commands and independent installation scope](https://docs.discord.com/developers/interactions/application-commands).
