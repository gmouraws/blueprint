# ADR-007: V1 Presentation and Release Gates

**Status:** Accepted

## Decision

Use one dark theme and target WCAG 2.2 AA. Feature BUILD-001 at launch. Keep system fonts, semantic navigation, a responsive layout, visible focus, and restrained blueprint line work. Static illustrations are sufficient; no Mermaid runtime or build toolchain is introduced.

Use GitHub Actions for lint, types, content validation, unit tests, production build, and Playwright/axe checks. Use Vercel Git integration for deployment later; Actions contains no deployment logic or Vercel credentials. Main remains production.

## Consequences

Automated accessibility checks are supplemented by human keyboard, screen-reader, and editorial review before deployment. Deployment behavior keys off VERCEL_ENV: production indexes published pages and loads analytics; development/preview output is noindex and excludes analytics.

Vercel project/domain setup and GitHub branch protection are not configured by this implementation. Required checks and human editorial approval must be enabled/verified before connecting production deployments.
