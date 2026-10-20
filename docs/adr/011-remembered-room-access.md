# ADR-011: Opt-in remembered room access

**Status:** Implemented for Preview review; not authorized for production release.

## Context

The owner requested optional 30-day authentication on trusted devices while keeping room admission explicit. Previously login always set a persistent 12-hour cookie, and leaving the call also logged out.

## Decision

- Keep the existing server-signed session and cookie, without a new service or dependency. The checkbox defaults to unchecked. Unchecked login uses a browser-session cookie and a 12-hour absolute server lifetime; checked login uses a 30-day cookie and absolute server lifetime. No sliding refresh.
- Sign the remember choice and enforce the corresponding lifetime on verification. Require valid issued-at/expiration claims. Legacy cookies without the choice keep the original 12-hour ceiling.
- Retain HttpOnly, SameSite=Strict, host-only scope and Secure on HTTPS/Vercel. Only loopback HTTP development omits Secure. Never write passwords or authentication tokens to browser storage or serialize them into page props.
- Verify the cookie in the request-rendered entry page; only the authenticated nickname reaches the UI. Require an explicit join gesture and validate again at /api/token, including rate limiting and room capacity. Microphone capture remains explicitly opt-in.
- Separate call exit from authentication: "Sair da sala" releases media and retains login. "Esquecer acesso neste dispositivo" on the entry screen clears the cookie through the existing origin-checked logout endpoint, with best-effort participant removal. Errors remain visible so a failed request cannot masquerade as logout.
- Retain key derivation from SESSION_SECRET and ROOM_PASSWORD. Changing either invalidates old application sessions. Autocomplete uses username and current-password for native password-manager support.

## Consequences and verification

Remembered access increases the lifetime of a stolen cookie; opt-in copy limits this to trusted devices. Clearing a device's cookie does not revoke a copied cookie elsewhere. Revocation remains expiry or password/signing-secret rotation, as in the existing stateless architecture. Already-connected LiveKit clients are not forcibly removed by application-session expiry or password rotation. Browser session restoration may retain session cookies, but cannot extend the signed 12-hour deadline. Cookies are host-only, so an unrelated Preview deployment hostname does not inherit them.

Unit/handler tests cover both cookie modes, exact expiry boundaries, malformed/overlong sessions, password/secret rotation, rate limits and logout. Browser tests cover safe server-rendered recognition, explicit admission, no capture, no credential storage, expiration during an open page, forgotten access, and accessible entry layouts. Local transport regression covers leave/rejoin without password re-entry. Cloud and physical-device acceptance remain separate; see ACCEPTANCE.md.

References: [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [browser cookie lifetimes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [autocomplete](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete).
