# Blueprint Architecture v1

## Architectural goal

Use the smallest production-quality architecture that supports a bilingual, content-driven engineering lab with excellent performance, accessibility, SEO, and maintainability.

## Proposed stack

- Next.js
- TypeScript
- Tailwind CSS
- MDX/content files
- syntax highlighting suitable for technical content
- Mermaid or an equivalent lightweight approach when diagrams are justified
- Vercel hosting
- GitHub as source of truth

Exact library choices beyond the core stack should be justified during implementation rather than accumulated preemptively.

## Runtime shape

Blueprint v1 should be static-first.

Public content should be generated at build time whenever practical. Do not introduce a database, authentication layer, CMS, or custom backend for v1.

## Deployment

Target flow:

`Codex/developer -> GitHub -> Vercel -> blueprint.app.br`

- `main` is production.
- Feature work should be reviewable before reaching `main`.
- Preview deployments should be used when available.
- No secrets belong in the repository.

## Content

Expected conceptual structure:

```text
content/
  en/
    builds/
    experiments/
    notes/
  pt/
    builds/
    experiments/
    notes/
```

The implementation may refine this structure if the result remains simple, typed, and compatible with the product/translation rules.

Content metadata should support at least:

- stable ID;
- slug;
- title;
- summary;
- locale;
- status where relevant;
- publication/update dates when real;
- tags/categories when useful;
- translation relationship.

## Internationalization and SEO

- English is canonical/default.
- Portuguese lives under `/pt`.
- Generate correct localized metadata.
- Use canonical and `hreflang` relationships appropriately.
- Avoid duplicate-content ambiguity.
- Language switching should preserve the equivalent page when a translation exists.

## Quality gates

Before production readiness:

- type checking passes;
- linting passes;
- tests appropriate to the implementation pass;
- production build passes;
- critical routes render in both locales;
- responsive behavior is validated;
- accessibility basics are validated;
- metadata/canonical/hreflang behavior is validated;
- broken internal links are prevented or checked.

## Security and privacy

- no credentials or secrets in Git;
- no professional/private content;
- minimize third-party scripts;
- avoid unnecessary tracking;
- collect no personal data in v1 unless separately approved.

### Approved implementation amendment

Vercel Web Analytics is approved as the minimal initial analytics integration. Metrics remain private; no advertising analytics, Google Analytics, custom events, or public visitor counter are permitted. See ADR-006 for boundaries and provider-policy review. The application adds no forms or account data collection.

Implementation details and operating commands are documented in `docs/IMPLEMENTATION.md`. ADRs 005–007 record newly accepted content, routing, analytics, presentation, and quality decisions.

## Future architecture

Search, analytics expansion, feeds, interactive experiments, APIs, databases, and AI/RAG may be introduced only when a concrete product requirement justifies them.
