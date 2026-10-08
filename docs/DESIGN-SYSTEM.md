# Blueprint Design System

## Approved direction

**Technical Editorial — an independent engineering publication.**

Typography, alignment, useful metadata, section numbering, and thin rules carry the identity. Keep the interface quieter than the engineering content. The approved light-first direction supersedes the initial dark Modern Engineering Blueprint presentation; see ADR-008.

Avoid résumé/portfolio layouts, SaaS landing pages, dashboards, card grids, thumbnails without a content purpose, decorative coordinates/grids, gradients, glows, glass, shadows, and decorative motion. One light theme is sufficient for this release.

## Palette

- Technical paper background: `#f5f3ec`
- Code/notice surface: `#ecebe3`
- Primary text: `#242724`
- Secondary text: `#62665e`
- Restrained Blueprint accent and focus: `#2358ad`
- Neutral rules: `#d2d3c8`

Use blue selectively for editorial numbers, identifiers, links, short rule accents, and focus. Thin neutral rules organize content; they are not interactive boundaries. Text and meaningful non-text indicators must meet WCAG 2.2 AA contrast requirements.

## Blueprint Planes mark

Preserve the original four offset construction planes: Idea → Specification → Build → Iteration. The mark retains its original navy, blue, and ink palette and geometry. The header uses it at 32 px beside the accessible Blueprint / Engineering Lab wordmark; the image itself is decorative.

`public/brand-mark.svg` contains the 40-unit geometry. The favicon uses the same planes on navy; the social asset scales them beside the wordmark. Keep these SVG representations synchronized and regenerate `social.png` from `social.svg` only when changing the mark. This redesign does not change the favicon or social assets.

## Typography and editorial structure

Use the existing system sans-serif stack for reading and headlines. Use monospace selectively for identifiers, statuses, dates, and small editorial labels. Normal prose must not look like source code. Avoid excessive uppercase and additional font families without a reading need.

The section identity is `01 / Builds`, `02 / Experiments`, `03 / Notes`, and `04 / About`, with localized names. Reuse it in indexes and article navigation. Build case-study sections have their own sequential numbering and restrained rule accents. Privacy and elements without a hierarchical purpose are not numbered.

The overall container is capped at 1120 px including gutters. Case-study and About layouts use a 900 px frame; article prose is capped at 680 px with an editorial number gutter on larger screens. Reading widths, metadata grouping, and navigation adapt deliberately for tablet and mobile.

## Page roles

- Home introduces the purpose: “I build software and document the engineering behind it.” Its supporting copy explains the subjects and publication formats. Builds, Experiments, and Notes appear as separate editorial indexes; BUILD-001 remains first in the current Builds index.
- Builds use IDs, textual lifecycle statuses, titles, summaries, and internal directional links. Case studies emphasize the question, constraints, decisions, failures, lessons, and existing Evidence, without invented metadata.
- Experiments retain their investigation-oriented content and truthful lifecycle. Notes emphasize technical writing and readable sections, with dates only when supplied by content.
- About introduces Guilherme Moura using the approved identity in `PRODUCT.md`, explains the lab through linked editorial rows, and states the principle. Keep “Things worth writing down.” in English and its concise natural Portuguese equivalent.
- Privacy lives at `/privacy` and `/pt/privacy`; the full existing analytics disclosure remains available through separate footer links. It does not dominate About.

Evidence is provenance: plain labels, links, and public-link/author-statement distinctions. Do not add badges, certification visuals, or social-proof treatment. Use `→` for internal directional links and `↗` for external destinations. Do not infer social-profile URLs.

## Status and accessibility

Build status uses a static dot plus visible localized text: LIVE green (`#287348`), BUILDING amber (`#966b14`), PLANNED blue (`#2358ad`), ARCHIVED muted (`#62665e`). Dots supplement text and are hidden from assistive technology. Preserve source lifecycle values; presentation never advances a build or experiment.

Use semantic landmarks, a correct heading hierarchy, skip navigation, keyboard-operable links, visible focus, language attributes, and localized accessibility labels. Keep code overflow bounded and keyboard accessible. Respect reduced motion; no decorative animation is needed.

Review both languages at 1440, 1024, 768, 375, and 320 px, including long titles, technical terms, section numbers, Evidence, and footer links. No page-level horizontal overflow is acceptable. Automated axe checks supplement visual and keyboard review.
