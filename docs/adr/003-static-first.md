# ADR-003: Static-First Architecture

**Status:** Accepted

## Context

Blueprint v1 is primarily public, editorial, and content-driven. Authentication, mutable application data, and server-side business workflows are not required.

## Decision

Use a static-first Next.js architecture deployed on Vercel, with content stored in the repository.

Do not introduce a database, CMS, authentication system, or custom backend in v1.

## Consequences

The initial system remains inexpensive, fast, auditable, easy for coding agents to reason about, and simple to deploy. Dynamic infrastructure can be added later only when justified by a real requirement.
