# Blueprint Product Specification v1

## Product

**Name:** Blueprint  
**Domain:** blueprint.app.br  
**Definition:** Personal Engineering Lab  
**Owner:** Guilherme Moura  
**Primary language:** English  
**Secondary language:** Brazilian Portuguese

### Tagline

> Engineering ideas into working systems.

### Product statement

Blueprint is a personal engineering lab for building software, exploring architecture, experimenting with AI-assisted development, and documenting the engineering decisions behind working systems.

It is intentionally not a traditional portfolio or résumé.

## Purpose

Blueprint should demonstrate engineering thinking through real builds, experiments, technical notes, architecture, trade-offs, failures, and lessons learned.

Professional credibility is an outcome of the work being visible; it is not the organizing principle of the product.

## Product principles

1. **Show the engineering, not the employment.**
2. **Build things worth documenting.**
3. **Document decisions, not just results.**
4. **Build in public.**
5. **AI-assisted, human-directed.**
6. **Simple until complexity is justified.**

## Information architecture

Public sections:

- `/` — Lab/home
- `/builds` — substantial things being built
- `/experiments` — bounded technical investigations and prototypes
- `/notes` — technical writing and engineering notes
- `/about` — short personal context about the lab

Portuguese equivalents live under `/pt`.

Do not introduce Experience, Career, Resume, Employers, Clients, or traditional Portfolio sections.

## Content identity

Content uses stable lab-style identifiers:

- `BUILD-001`
- `EXP-001`
- `NOTE-001`

Blueprint itself is `BUILD-001`.

## MVP

The first public release should contain:

- **BUILD-001 — Blueprint**
- **EXP-001 — Building with an AI Coding Agent**
- **NOTE-001 — Why an Engineering Lab Instead of a Portfolio**
- **NOTE-002 — Designing Software Repositories for AI Coding Agents**
- a concise About page with no employment timeline

Initial content must be truthful and must not pretend unfinished experiments have already produced results.

## Languages

English is canonical. Portuguese is a localized reading experience, not a separate product.

Routes:

- `/`, `/builds`, `/experiments`, `/notes`, `/about`
- `/pt`, `/pt/builds`, `/pt/experiments`, `/pt/notes`, `/pt/about`

A content item may temporarily exist only in English. The Portuguese experience must communicate that state cleanly rather than block publication.

## Non-goals for v1

- authentication;
- database;
- CMS;
- comments;
- newsletter infrastructure;
- AI chat/RAG;
- complex backend;
- employment timeline;
- automated publication of unreviewed editorial content.

## Future direction

Potential future capabilities may include richer architecture diagrams, interactive engineering experiments, feeds, search, and a grounded AI interface over public Blueprint content. They require separate decisions and must not complicate v1 prematurely.
