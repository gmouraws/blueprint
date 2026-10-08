# ADR-008: Technical Editorial Presentation

**Status:** Accepted

## Context

Human review approved replacing the original dark, boxed Blueprint presentation because it felt too close to developer-portfolio and SaaS conventions. Blueprint should read as an independent engineering publication. Successive reviews approved the light-first Home, numbered Build case studies, and personal editorial About introduction.

## Decision

Use one warm-paper light theme with near-black reading text, restrained Blueprint blue, system typography, editorial rows, thin rules, and purposeful numbering. Preserve the original Blueprint Planes vector mark. Keep Builds, Experiments, and Notes distinct through their existing content and metadata; do not add cards, decorative imagery, new content fields, or a UI framework.

About introduces Guilherme using the explicitly approved identity and statements recorded in PRODUCT.md. Keep the privacy disclosure intact on dedicated static `/privacy` and `/pt/privacy` pages, using existing metadata, localization, sitemap, and build-verification conventions. Footer links expose About and Privacy separately. Analytics behavior is unchanged.

This supersedes the dark-theme and decorative presentation choices in ADR-007 and the disclosure location in ADR-006. Their accessibility, quality-gate, privacy, static-first, and deployment decisions remain in force.

## Consequences

The identity relies on typography and content rather than decorative effects. System fonts avoid new dependencies but may vary slightly across operating systems. Both languages and all public page types require responsive, keyboard, contrast, and visual review. Existing content, lifecycle states, Evidence semantics, content registry, SEO architecture, analytics, CI, and deployment infrastructure are preserved.

The dedicated privacy pages add two static public routes, not a new product subsystem. Review screenshots remain ignored local artifacts. Delivery is through a reviewed pull request; this decision does not authorize merging, manual deployment, or Vercel/DNS changes.
