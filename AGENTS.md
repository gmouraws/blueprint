# Blueprint Agent Instructions

## Mission

Blueprint is a public personal engineering lab by Guilherme Moura. It exists to build software, explore architecture, experiment with AI-assisted development, and document engineering decisions behind working systems.

Blueprint is not a résumé, employment portfolio, company history, or showcase of proprietary professional work.

Read this file and all relevant files under `/docs` before making material changes.

## Authoritative project context

This repository is the authoritative context for Blueprint.

Never infer personal or professional facts from unrelated repositories, workspaces, conversations, private sources, or external context. Do not inspect, copy from, depend on, or reference unrelated private projects.

Public documentation and public open-source material may be consulted when needed.

## Confidentiality and professional-content isolation

Never publish, reconstruct, infer, or reference:

- employer or client names;
- coworker, stakeholder, or customer names;
- internal project or proprietary product names;
- professional repository content or code;
- internal screenshots, URLs, infrastructure, architecture, metrics, requirements, or business data;
- customer or patient information;
- confidential implementation details;
- information inferred from unrelated repositories or private sources.

Professional experience may inspire general engineering topics, but every Blueprint implementation and example must be independently created from first principles using public knowledge and original code.

If provenance is uncertain, do not use or publish the information.

**Show the engineering, not the employment.**

## Product principles

1. Show the engineering, not the employment.
2. Build things worth documenting.
3. Document decisions, trade-offs, failures, and lessons, not only outcomes.
4. Build in public when safe.
5. AI-assisted, human-directed.
6. Keep the system simple until complexity is justified.
7. Accessibility, performance, mobile, and tablet usability are first-class requirements.

## Languages

- English is the canonical/source language.
- Brazilian Portuguese is the secondary public language.
- Follow `docs/TRANSLATION-GUIDE.md`.
- Never translate technology names, code identifiers, framework/library names, commands, or other protected technical terms.
- Translate explanatory prose naturally rather than mechanically.

## Autonomy

Agents may independently implement, test, refactor, improve accessibility/responsiveness, update technical documentation, create branches/commits/PRs, and fix CI within approved specifications.

Agents must not independently:

- change the product mission or core principles;
- turn Blueprint into a résumé or traditional portfolio;
- invent facts about Guilherme;
- introduce professional/confidential material;
- publish substantial new biographical or editorial claims without human approval;
- add infrastructure or dependencies without a clear product or engineering reason.

## Engineering expectations

- Prefer the smallest architecture that satisfies the requirements.
- Keep secrets out of Git.
- Do not commit `.env` files or credentials.
- Favor static generation for public content.
- Treat `main` as production.
- Keep content and implementation reviewable.
- Record consequential architecture decisions as ADRs.
- Tests, linting, type checking, accessibility, SEO, metadata, and responsive behavior are part of done.

When requirements are ambiguous and the choice could materially alter product direction, stop and surface the ambiguity instead of inventing product requirements.
