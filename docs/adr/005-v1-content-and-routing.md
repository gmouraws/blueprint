# ADR-005: Small Static Content Registry and Bilingual Routes

**Status:** Accepted

## Context

The implementation plan was approved with App Router, Server Components, repository-owned MDX, shared slugs, and a single validated registry. Draft content must never enter production output.

## Decision

Use thin EN and `/pt` route trees sharing server-rendered views. Detail routes live under builds, experiments, and notes. Root layouts set `en` or `pt-BR`. No language middleware or runtime translation is needed.

Validate metadata with Zod and parse YAML frontmatter with `yaml`. Generate `.generated/content.json` containing only PUBLISHED entries before development/build. The application reads that registry, never source content directories. MDX is repository-trusted build input; `next-mdx-remote/rsc` compiles it with static highlighting and heading IDs. There is no CMS, backend, or diagram toolchain.

Use DRAFT/PUBLISHED publication values. Build states are PLANNED/BUILDING/LIVE/ARCHIVED. Experiment states are PLANNED/RUNNING/COMPLETED/FAILED/ARCHIVED. Notes have no lifecycle status.

Translations reference the same stable ID and a SHA-256 fingerprint of the entire English file, normalizing CRLF to LF. A stale translation fails content validation until a human reviews it and updates the fingerprint or removes it from publication. Missing translations do not block English publication.

## Consequences

Metadata, listings, routes, and SEO share the same published registry. Slugs are identical across languages. Missing Portuguese articles link to English from Portuguese listings; the article switcher links to the target-language section with an explanatory message. Localized pages self-canonicalize; English remains the editorial source.

Source changes require a rebuild. Translation hashes conservatively flag metadata-only changes too. No draft preview mode is implemented, keeping deployment output independent of draft source material.
