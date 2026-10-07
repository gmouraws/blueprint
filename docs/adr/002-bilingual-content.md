# ADR-002: English Canonical, Portuguese Localized

**Status:** Accepted

## Context

Blueprint should be useful internationally and to Brazilian readers without doubling editorial effort or producing awkward machine-translated technical language.

## Decision

English is the canonical source language. Brazilian Portuguese is a localized version under `/pt`. Translation occurs during the content workflow, not at runtime, and follows `docs/TRANSLATION-GUIDE.md`.

## Consequences

English content may ship before its Portuguese translation. Technical terminology remains consistent, translations are version-controlled, and SEO can express explicit locale relationships.
