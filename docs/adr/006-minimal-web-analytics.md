# ADR-006: Minimal Vercel Web Analytics

**Status:** Accepted

## Context

The approved implementation amendment adds Vercel Web Analytics as the initial analytics solution. The original v1 avoided unnecessary tracking; this narrowly scoped amendment permits aggregate usage analytics.

## Decision

Use `@vercel/analytics/next` only when VERCEL_ENV is production. Keep metrics private in the Vercel dashboard. Remove query strings and fragments with beforeSend and reject custom events. Set Referrer-Policy to no-referrer. Do not add advertising analytics, Google Analytics, custom events, a visitor counter, or a consent framework without an actual requirement.

## Consequences

Local and preview builds have no analytics component. Production requires enabling Web Analytics in the eventual Vercel project; this implementation does not configure that project. The integration is disclosed in both languages. [ADR-008](008-technical-editorial-presentation.md) moves that disclosure from About to dedicated Privacy pages without changing analytics behavior.

Vercel describes its implementation as cookie-free and documents the data it processes. This does not establish a blanket legal exemption: the owner should review the current provider policy and applicable requirements before enabling production analytics. No legal conclusion is claimed here.

References: https://vercel.com/docs/analytics/privacy-policy and https://vercel.com/docs/analytics/package
