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

Public entries contain reviewed case studies, planned investigations, and focused insights. BUILD-001 records the human-confirmed production outcome; other entries make no invented result claims. PUBLISHED means eligible for public output and does not imply LIVE. Review prose and translations before publication. About strings are maintained in src/lib/i18n.ts.

## Environment

No application secrets or .env files are required. Production origin is fixed to https://blueprint.app.br. VERCEL_ENV is provided by Vercel later: production enables indexing and analytics; preview/development/absent values disable them. For local production-mode verification, set VERCEL_ENV=production before building and unset it afterward. These decisions are evaluated at build time; changing environment requires rebuilding.

## Deployment workflow

The owner has confirmed that the corrected production deployment and blueprint.app.br over HTTPS work. Deployment remains through Vercel Git integration after human review and merge to main. This refinement changes no infrastructure. Continue reviewing provider privacy requirements, preview protection, required GitHub checks, routing, metadata, analytics, and rollback. Do not add a duplicate deployment workflow.

No legal exemption is assumed from cookie-free analytics. No consent system is added without an actual requirement. About includes the analytics disclosure. No custom events are sent, URL queries/fragments are stripped, and referrers are suppressed by response policy.

The official Analytics component is wrapped in src/components/analytics.tsx and mounted by the shared Shell for both root layouts only when VERCEL_ENV is production at build time. An onboarding dashboard is not proof that the component is missing. After enabling Web Analytics for the correct Vercel project, a new production deployment is required; then verify a normal browser loads the SDK-configured script and sends successful pageview requests without blockers. Script URLs may be provider-configured rather than fixed. Vercel's served script excludes automated/headless visitors, so CI checks mount/queue/privacy behavior with a substituted provider script and does not claim dashboard ingestion. Metrics remain private. See [Vercel's setup](https://vercel.com/docs/analytics/quickstart) and [troubleshooting](https://vercel.com/docs/analytics/troubleshooting).

## Remaining human checks

Blueprint v1 has human visual review and release approval. The following checks concern ongoing operation and publication.

- Review future editorial changes and pt-BR translations, including protected terms.
- Confirm statuses and add actual dates at publication.
- Review visual design at desktop/tablet/mobile sizes and screen-reader behavior.
- Check provider privacy obligations, preview protection, domain ownership, branch protection, and production analytics after authorized setup.
- Review npm advisories before release. Production dependency audit is clean at implementation time; lint tooling has a transitive braces advisory with no patched version reported by npm. Do not downgrade Next.js tooling to an incompatible major merely to silence it.

The security policy restricts embedding, objects, and base URLs. It does not claim a complete script CSP; nonce-based rendering would add complexity to a static site. No remote content, account system, or form is implemented.

## Build evidence

Optional Build-only evidence frontmatter is a short list (up to eight items) with label, basis (public or self-documented), and optional url. Public items require a public HTTPS URL; self-documented items identify author statements and may omit a link. URLs cannot contain credentials. This is an editorial distinction, not automated verification or certification. Only add public links that have been reviewed. Localize labels while preserving the same ordered basis/URL pairs in translation. The shared article renderer displays the list near the end of the case study. Omit it when there is no supporting material, as with planned BUILD-002.

## Release hygiene

Post-build verification uses the Next.js prerender manifest to require all public routes and metadata routes to remain static, reject unpublished route output, and forbid runtime fallback paths. It discovers rendered artifacts recursively under the server build output, matching pages by canonical URL and metadata responses by content rather than guessing filenames. Indexing, exact sitemap URLs, robots, the published-only registry, and source isolation in output file traces remain mandatory. CI also builds with a provider-neutral test adapter to exercise Next.js's alternate output layout. A missing artifact or unsupported manifest fails verification rather than silently skipping a check.

Build output, the generated registry, browser screenshots/reports, next-env.d.ts, .vercel/, and environment files are ignored. `npm run typecheck` runs `next typegen` before TypeScript, so generated declarations are available from a clean checkout. Next.js automatic agent-rule generation is disabled to preserve the repository-owned AGENTS.md. The committed social.png is an intentional sharing asset derived from social.svg, not a test screenshot.
