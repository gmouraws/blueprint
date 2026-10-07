# Blueprint Design System Direction

## Concept

**Modern Engineering Blueprint**

The visual system should evoke engineering drawings and technical specifications without becoming retro, gimmicky, or visually noisy.

Blueprint should feel precise, calm, modern, and deliberately technical.

## Avoid

- traditional résumé/portfolio aesthetics;
- generic SaaS landing-page patterns;
- purple gradient branding;
- glassmorphism;
- Matrix/hacker aesthetics;
- fake terminals as decoration;
- excessive rounded cards;
- excessive animation;
- blueprint motifs so strong that readability suffers.

## Visual language

Use:

- deep navy / near-black foundations;
- restrained blueprint blue accents;
- subtle technical grid/line work;
- generous negative space;
- strong typography;
- thin dividers and annotation-like details;
- restrained coordinates, identifiers, measurements, or technical labels where meaningful.

Initial color direction, subject to accessibility validation:

- background: `#07111F`
- surface: `#0B1728`
- blueprint accent: `#2F81F7`
- text: `#E8EEF7`
- muted: `#8292A8`
- grid/line: low-opacity blue derived from the palette

These are design direction values, not permission to sacrifice WCAG contrast.

## Typography

Favor a highly readable modern sans-serif for primary reading. A restrained mono or technical face may be used for identifiers, metadata, coordinates, or labels.

Do not make long-form prose look like source code.

## Content language

The interface may use lab vocabulary such as:

- BUILD
- EXP
- NOTE
- SPEC
- ARCH
- LOG

Stable identifiers such as `BUILD-001` are part of the visual identity.

Build lifecycle statuses use a small static dot beside a visible localized label: green for LIVE, amber for BUILDING, blue for PLANNED, and muted for ARCHIVED. Color supplements the text; dots are hidden from assistive technology. BUILD-001 remains BUILDING until production at blueprint.app.br is successfully verified.

## Layout

The home page should prioritize:

1. Blueprint / Engineering Lab identity;
2. tagline and concise explanation;
3. current/featured build;
4. recent lab activity;
5. restrained owner attribution and external links.

The design must work deliberately at desktop, tablet, and mobile widths. Tablet/mobile behavior is part of the component design, not a later retrofit.

## Motion

Motion should communicate state or hierarchy, not decorate the page. Respect `prefers-reduced-motion`.

## Accessibility

- semantic HTML;
- keyboard navigability;
- visible focus states;
- WCAG-compliant contrast;
- meaningful link text;
- appropriate reduced-motion behavior;
- no information conveyed only by color;
- localized accessibility labels.
