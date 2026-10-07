# Blueprint Translation Guide

## Strategy

English is the canonical source language. Brazilian Portuguese (`pt-BR`) is a localized reading experience.

Translation is a content workflow step, not runtime machine translation. A translated page is stored, reviewed, versioned, and deployed like any other content.

## Goal

Portuguese should sound natural to Brazilian software engineers. Do not translate technical vocabulary mechanically merely to remove English words.

Translate meaning and explanatory prose while preserving established engineering terminology.

## Never translate

Keep these unchanged when they are names, identifiers, or established technical tokens:

- programming languages and platforms: .NET, C#, TypeScript, JavaScript, Node.js;
- frameworks/libraries/products: React, Next.js, Tailwind CSS, Vercel, GitHub, Codex;
- code identifiers, file names, paths, commands, API names, package names, environment variables;
- content identifiers: BUILD-001, EXP-001, NOTE-001;
- protocol/standard/acronym names when normally used unchanged: HTTP, REST, API, CI/CD, ADR, SEO;
- literal code, configuration, stack names, and version strings.

## Prefer industry usage

For engineering terminology, use the form that is natural in Brazilian engineering teams rather than forcing a literal translation.

Examples that may reasonably remain in English depending on the sentence include:

- stack
- commit
- pull request
- deploy / deployment
- runtime
- trade-off
- event-driven
- AI-assisted development
- code review
- build
- workflow
- framework

Consistency matters more than eliminating English.

## Translate

Translate normal interface and explanatory language:

- navigation labels when a natural Portuguese equivalent exists;
- headings and descriptions;
- explanatory paragraphs;
- context, conclusions, lessons, and calls to action;
- accessibility labels and user-facing messages;
- SEO title/description where appropriate.

Brand-like content taxonomy identifiers such as `BUILD-001`, `EXP-001`, and `NOTE-001` remain unchanged even when surrounding labels are localized.

## Translation workflow

1. Author or update canonical English content.
2. Generate/update the pt-BR translation.
3. Enforce this guide and glossary.
4. Compare technical tokens with the English source.
5. Review meaning, tone, omissions, and accidental technical-term translation.
6. Store the translation as version-controlled content.
7. Build and validate both locales.

Do not call a translation complete merely because every sentence has a Portuguese equivalent.

## Missing translations

Missing Portuguese content must not block an English publication.

The Portuguese site may show the item with a clear, localized indication that the article is currently available only in English and link to the canonical English version.

## Tone

Both languages should be concise, technical, curious, and grounded. Avoid corporate marketing language and exaggerated claims.

## Glossary governance

Add recurring terms here when a translation decision needs to become stable across the site. Do not create a glossary entry for every English technical word; capture only decisions that prevent inconsistency.
