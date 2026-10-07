# Blueprint v1 implementation

## Local workflow

Use Node.js 22.17 or a compatible Node 22 release and npm (one committed package-lock.json).

```sh
npm ci
npm run dev
```

Quality gates:

```sh
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

Build validates content before Next.js. Public routes are statically generated. Server Components are the default; the path-aware header language switcher and production analytics use small Client Components. The switcher receives only published destination paths, preserving article equivalents without request-dependent rendering. Tailwind CSS supplies tokens and processing; CSS handles the site layout without an additional component library.

## Content

Files live in content/en and content/pt beneath builds, experiments, and notes. The filename must equal slug.mdx. Frontmatter requires id, kind (plural section name), locale (en/pt-BR), slug, title, summary, and publication (DRAFT/PUBLISHED). Build/experiment status is mandatory; notes cannot have status. Optional publishedAt/updatedAt are real ISO date strings, quoted in YAML. Omit them until a real publication/update occurs. Optional tags are strings.

Portuguese files require translationOf (the English stable ID) and sourceRevision (SHA-256 of the entire English file, CRLF normalized to LF). After reviewing meaning, protected terminology, and code, compute the revision:

```sh
npx tsx -e "import {readFileSync} from 'node:fs'; import {revisionOf} from './src/lib/content'; console.log(revisionOf(readFileSync('content/en/builds/blueprint.mdx', 'utf8')))"
```

Update sourceRevision only after translation review. Outdated translations fail the quality gate; an absent translation does not. Publication and lifecycle are separate: a PUBLISHED article can truthfully describe a PLANNED experiment.

The generator validates source files and writes only PUBLISHED entries to ignored .generated/content.json. The application reads only this file. After editing content, restart `npm run dev` to regenerate and reload the registry. Draft-only assets must not be placed under public/, which is always publicly served. No draft rendering mode exists. MDX is trusted repository code: review changes and do not use unrelated/private sources or unreviewed executable content.

Initial EN/PT entries contain approved project decisions and planned investigation methods. They claim no results or measured outcomes. PUBLISHED means eligible for the local release candidate; it does not record a deployment or replace human editorial approval. Review all prose and translations before production. About strings are maintained in src/lib/i18n.ts. No personal external URLs were supplied, so none were invented.

## Environment

No application secrets or .env files are required. Production origin is fixed to https://blueprint.app.br. VERCEL_ENV is provided by Vercel later: production enables indexing and analytics; preview/development/absent values disable them. For local production-mode verification, set VERCEL_ENV=production before building and unset it afterward. These decisions are evaluated at build time; changing environment requires rebuilding.

## Deployment preparation — not configured

After human release review, connect this repository through Vercel Git integration, select main as production, match the Node/npm toolchain, and configure blueprint.app.br with HTTPS. Enable Web Analytics only after reviewing provider policy and privacy requirements. Protect preview deployments, enable GitHub required checks, and confirm production routing, metadata, analytics, and rollback. Do not add a duplicate deployment workflow.

No legal exemption is assumed from cookie-free analytics. No consent system is added without an actual requirement. About includes the analytics disclosure. No custom events are sent, URL queries/fragments are stripped, and referrers are suppressed by response policy.

## Remaining human checks

Blueprint v1 has human visual review and release approval. The following checks concern the later production setup and ongoing publication workflow.

- Review future editorial changes and pt-BR translations, including protected terms.
- Confirm statuses and add actual dates at publication.
- Review visual design at desktop/tablet/mobile sizes and screen-reader behavior.
- Check provider privacy obligations, preview protection, domain ownership, branch protection, and production analytics after authorized setup.
- Review npm advisories before release. Production dependency audit is clean at implementation time; lint tooling has a transitive braces advisory with no patched version reported by npm. Do not downgrade Next.js tooling to an incompatible major merely to silence it.

The security policy restricts embedding, objects, and base URLs. It does not claim a complete script CSP; nonce-based rendering would add complexity to a static site. No remote content, account system, or form is implemented.

## Release hygiene

Build output, the generated registry, browser screenshots/reports, next-env.d.ts, .vercel/, and environment files are ignored. `npm run typecheck` runs `next typegen` before TypeScript, so generated declarations are available from a clean checkout. Next.js automatic agent-rule generation is disabled to preserve the repository-owned AGENTS.md. The committed social.png is an intentional sharing asset derived from social.svg, not a test screenshot.
