# ADR-009: Replace the public lab with Blueprint Room

**Status:** Accepted for implementation and production replacement with explicit owner approval. See docs/RELEASE.md for the release boundary and remaining manual verification.

## Context

The owner explicitly requested a working private voice/screen-sharing room for five friends at blueprint.app.br, replacing the old website completely. The owner subsequently approved increasing capacity to eight participants. This supersedes the public-lab product, bilingual content, static-only routing, analytics and presentation decisions in ADRs 001–003 and 005–008. ADR-004's repository isolation and confidentiality rules remain mandatory.

## Decision

Retain Next.js/TypeScript/Tailwind and the existing repository/Vercel Git integration. Use Node route handlers for shared-password login, signed HttpOnly sessions and short-lived tokens. Use official LiveKit Cloud SDKs for direct browser media/data. Enforce an eight-person fixed room both when explicitly creating it and in every signed token's automatic-creation configuration. Fail closed on a mismatched existing room cap.

Use Upstash Redis sliding-window counters for production-compatible rate limiting; missing credentials, timeouts and outages deny authentication. Disable analytics for rate limiting and the app. All UI is pt-BR, all engineering documentation/code comments English. No persistent chat or fabricated calls. Missing setup yields an explicit configuration state.

## Consequences

The app needs LiveKit and Upstash setup, but only free plans are authorized. Provider quotas apply. Browser support and capture audio vary. Short token expiry limits initial admission, not ongoing session length. The owner authorized production release after reporting working Preview entry, while explicitly leaving real multi-user/ninth-admission/media/reconnect acceptance unverified. Preserve the original main SHA in docs/IMPLEMENTATION.md for a reviewed Git revert; never rewrite history. Use the existing Git integration for this release; no DNS changes or duplicate manual production deployment are needed.
