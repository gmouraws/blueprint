# ADR 026 — Public introduction and private Windows distribution

Status: owner-approved scope; release requires successful private-asset and authorization verification.

The owner subsequently authorized direct Production verification instead of repairing the missing Preview auth-secret scope. Keep Preview configuration unchanged, require automated checks, and validate real owner/download access after the existing Git deployment. A confirmed critical failure still blocks release. Next.js 16.4.1 is the minimal security patch required after the final build raised an advisory; no additional dependency or architecture is introduced.

The public landing explains the experiment in English/Brazilian Portuguese, without media discovery, invitations, member data or installer URLs. Its restrained footer includes the owner-approved creator attribution and social links. Existing private routes, Discord callbacks and Windows contracts are preserved.

Keep the original Production Windows 0.1.7 executable unchanged. Its filename, byte length and SHA-256 live in the server-only distribution module. Use the existing environment-isolated private Blob store. Verify the original checksum and the private copy before withdrawing executable assets from GitHub Releases; preserve release records, tags and checksums. Existing installed clients use hosted HTTPS and manual updates, not a GitHub updater.

The existing single owner role manages distribution inside the current profile dialog. Recipient choices come from existing active, email-verified registered accounts. Pending invitations alone are not download authorization. No new registration/provider, database schema, credential or infrastructure is introduced.

Create random 256-bit bearer credentials, store only SHA-256 hashes in the existing environment-specific Redis namespace, and expire links after 24 hours. Credentials appear only in fragments until removed into page memory; never persist or log them. Require a current account session matching the chosen recipient at redemption. Deactivation/session revocation prevents subsequent download authorization.

Redis Lua atomically transitions an unused link to claimed or revoked. Fetch and validate the fixed private asset before claiming; only the winner may receive its stream. Never redirect to a public or presigned object URL. Claim occurs before bytes are sent: an interrupted transfer consumes the attempt and requires the owner to issue a fresh link. This deliberate fail-closed tradeoff avoids resumable/reusable capabilities. File bytes stream through the function, with no-store, no-referrer and attachment headers. No server buffering, arbitrary file paths or URLs are accepted.

Optional email sends use existing Resend configuration and only the selected registered recipient. Report provider acceptance separately from delivery. Copy remains possible immediately after creation; plaintext cannot be recovered later. Records expire after 48 hours and the bounded owner index is pruned during issuance.

Keep existing OTP generic responses, IP/email limits, one-minute resend cooldown, five-minute code expiry, three provider verification failures and single-use consumption. Unauthenticated entry says Private access/Acesso privado. Only an authenticated owner sees administration controls; every management API independently checks the database-backed role.

For future commits, use the private noreply address shown in GitHub Settings → Emails; configure it locally for this repository. Do not publish a personal address or rewrite existing history in this task. Documentation omits unnecessary provider identifiers; operational configuration is unchanged.

Recovery: revert the web PR or restore the recorded Vercel deployment without changing accounts/history/storage. Do not restore public executable distribution as a rollback. Retain the private original, disable issuance if needed, and revoke unused links. The desktop binary/version and source tags remain unchanged.
