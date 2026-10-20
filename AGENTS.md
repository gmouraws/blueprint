# Blueprint Agent Instructions

## Mission

Blueprint Room is a private browser-based voice, screen-sharing, and ephemeral chat room for up to eight friends. The owner explicitly approved replacing the public engineering lab; see docs/adr/009-private-room-replacement.md. Work only toward preview review until the owner approves production replacement.

Blueprint is not a résumé, employment portfolio, company history, or showcase of proprietary professional work.

Read this file and all relevant files under `/docs` before making material changes.

## Authoritative project context

This repository is the authoritative context for Blueprint.

Never infer personal or professional facts from unrelated repositories, workspaces, conversations, private sources, or external context. Do not inspect, copy from, depend on, or reference unrelated private projects.

Public documentation and public open-source material may be consulted when needed.

## Repository Identity and Isolation

- The only GitHub repository authorized for Blueprint is `gmouraws/blueprint`.
- The canonical remote is `https://github.com/gmouraws/blueprint.git`.
- Blueprint agents must never push, create branches, open pull requests, create issues, or perform any other write operation against Curadel, employer, client, professional, or unrelated repositories or GitHub organizations.
- Repositories or organizations associated with `gemoura-curadel` are not part of Blueprint and must never be used for Blueprint work.
- Do not infer repository ownership or destination from globally configured Git credentials, GitHub accounts, previously used repositories, neighboring workspaces, or other projects.
- Before any remote write operation, verify that the target repository is exactly `gmouraws/blueprint`.
- If the configured remote does not resolve to `gmouraws/blueprint`, stop and report the mismatch instead of attempting to fix, push, or continue against another repository.
- Reading or inspecting unrelated/private repositories for Blueprint context is also prohibited by the professional-content isolation rules below.

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

1. One fixed private room, at most eight participants, with server-enforced admission.
2. Reliable voice and screen sharing before extra features.
3. Ephemeral plain-text chat; no recordings, AI, analytics, or advertising.
4. No secrets in browser bundles, logs, URLs, or Git.
5. Keep architecture small; fail closed when security dependencies are unavailable.
6. Preserve accessibility, keyboard controls, and smaller-screen usability.
7. Preserve the previous website through Git history and a recorded recovery SHA.

## Languages

- All application UI is Brazilian Portuguese.
- Code, comments, and repository documentation are English.
- Preserve technology names and code identifiers; follow docs/TRANSLATION-GUIDE.md.

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
- Do not commit `.env` files or credentials. `.env.example` may contain placeholders only.
- Use Vercel for UI/auth/token endpoints and LiveKit Cloud for media/data; never proxy media through Vercel.
- Treat `main` as production.
- Keep content and implementation reviewable.
- Record consequential architecture decisions as ADRs.
- Tests, linting, type checking, accessibility, SEO, metadata, and responsive behavior are part of done.

When requirements are ambiguous and the choice could materially alter product direction, stop and surface the ambiguity instead of inventing product requirements.
