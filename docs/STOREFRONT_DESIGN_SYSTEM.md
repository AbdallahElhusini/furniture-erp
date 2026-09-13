# HATAB Editorial Commerce System

This document defines the customer-facing visual and interaction system for HATAB. The ERP administration interface remains a separate operational product and should not inherit storefront display patterns.

## Design idea

HATAB should feel like an architectural furniture journal that can turn directly into a project request. The system combines:

- Product scale and atmospheric depth from immersive furniture presentations.
- Oversized editorial typography and decisive black/ivory contrast.
- Architectural grids, numbering, and asymmetric layouts.
- Material storytelling through swatches, close-ups, dimensions, and related pieces.
- A persistent project board instead of a conventional retail cart.

Reference layouts are inspiration for hierarchy and pacing only. Their artwork, copy, exact compositions, and brand devices must not be reproduced.

## Brand foundations

### Core palette

- `surface-paper`: the primary product and reading canvas.
- `surface-editorial`: warm neutral section contrast.
- `surface-ink`: high-contrast editorial bands and project storytelling.
- `surface-sage` / `surface-sage-soft`: immersive workspace scenes.
- `oxblood-700`: HATAB action and identity accent.
- `forest-950`: primary ink on light and sage surfaces.
- `brass-300`: sparing highlight for numbering and material detail.

Use oxblood for decisions, not decoration. Use sage for spatial context. Use near-black bands to control pacing between light product sections.

### Typography

- Tajawal remains the UI and Arabic body family.
- Arabic display text uses natural tracking; never apply negative letter spacing.
- `editorial-display`: campaign or collection identity only.
- `editorial-heading`: page and major section headings.
- Body copy stays between 15–18px with 1.7–2.0 line height in Arabic.
- Latin identifiers use small deliberate tracking and must remain secondary.

### Layout

- `editorial-shell`: maximum 90rem, responsive gutters.
- `editorial-section`: shared vertical rhythm.
- Use asymmetric 12-column compositions for hero, collection, portfolio, and product storytelling.
- One dominant image or object per viewport; supporting cards must remain subordinate.
- Geometry is architectural, not bubbly: controls use 6–10px corners, panels 12–14px, and large media frames never exceed 18px.
- Use true circles only for swatches, status dots, avatars, and square icon controls.
- Prefer thin rules, coordinate marks, crosshairs, and grid alignment over decorative capsules.

## Components

### Navigation

- Minimal paper surface with clear active state.
- Search and project board are first-class actions.
- Mega-menu groups products by workspace purpose.
- Mobile drawer preserves the same hierarchy and keyboard focus containment.

### Hero and campaign stage

- A light architectural field or an approved full-bleed environment, with distinct foreground/background color zoning.
- One oversized Arabic statement.
- One dominant product composition.
- Maximum two primary actions.
- Optional material/mood panel and one related-product annotation.
- Pointer depth is capped at 2.5 degrees and disabled for coarse pointers or reduced motion.
- The canvas dot/line field is decoration only, pauses outside the viewport, caps device-pixel ratio, and renders one static frame for reduced motion.

### Product card

- Image occupies most of the card.
- Category/SKU metadata is subordinate.
- Product name, project action, and image target remain independently keyboard accessible.
- Hover can reveal a second approved image but must not cause layout movement.

### Catalog controls

- Search, filter, and sort states are URL-backed.
- Active filters use compact removable tags with restrained corners.
- Price bands operate only on positive verified `sellingPrice` values; zero or unset prices are explicitly “price on request.”
- Style edits are deterministic lists of existing SKUs and are always intersected with the publication gate.
- Mobile controls use a clear sheet/dialog rather than compressed desktop controls.
- Empty results provide recovery actions and never look like a broken grid.

### Product page

- Image-first asymmetric layout.
- Product name is the dominant identity.
- Verified specifications, materials, dimensions, downloads, and related workspace pieces form distinct editorial bands.
- Unknown values are omitted, never invented.
- Add-to-project remains visible without obscuring content.

### Project board and quote

- The floating board is a compact dock, not a full-width obstruction.
- Quote progress is numbered and explicit.
- Forms use grouped sections, persistent labels, clear validation, and a final review before submission.
- Contact details remain unpublished until verified.

### Language

- Arabic and English share the same information architecture and functionality.
- The `hatab_storefront_locale` cookie preserves the customer choice; switching refreshes server-rendered catalog fields and updates `lang` / `dir`.
- Every stored bilingual field uses its locale-specific value with a truthful fallback to the other language.
- Icons expressing forward/back direction change with locale; logical CSS properties are preferred over physical left/right alignment.
- Currency and counts use locale-aware formatting while SKU identifiers remain left-to-right.

### Coordinated style edits

- The initial system includes Classic, Boho / Natural, Smart, Contemporary, and Dynamic.
- Each edit combines a real desk, chair, storage item, and meeting or space-planning piece rather than grouping by appearance alone.
- Cards expose member categories, SKUs, and verified/request-only price state so the concept remains understandable.
- Draft database collections never appear as published style edits.

### Scroll-driven process film

- The home hero tells one ordered HATAB story: design, engineering, craft, coordination, then smart-office installation.
- Film time follows scroll progress in both directions; it never free-runs or captures the mouse wheel.
- Stage-copy thresholds match visible changes in the supplied film instead of dividing the timeline arbitrarily.
- GSAP ScrollTrigger owns progress and text replacement. Video seeking is throttled through `requestAnimationFrame` so rapid wheel input cannot queue excessive decoder work.
- The production film is a silent, fast-start H.264 asset with a keyframe every 0.2 seconds for responsive forward and reverse scrubbing.
- The sticky frame begins below the 6.5rem storefront header and preserves one semantic page heading.
- Reduced-motion visitors receive a normal-height static process summary. Loading and media-error states retain every stage in readable text.

## Page rhythm

1. Immersive identity or product stage.
2. High-contrast evidence or positioning band.
3. Primary discovery grid.
4. Materials, applications, or product narrative.
5. Project action and next step.

Alternate paper, editorial neutral, sage, and ink surfaces. Avoid multiple consecutive card grids on the same background.

## Motion

- Fast feedback: 180ms.
- Standard component transition: 300ms.
- Editorial reveal: 520–800ms.
- Animate transforms and opacity only where practical.
- Procedural canvas motion may respond gently to pointer and scroll, but never competes with reading or product actions.
- Scroll-linked film and text may scrub with page progress, but must not override native scrolling or hide the document scrollbar.
- No automatic carousels, scroll hijacking, or essential hover-only content.
- `prefers-reduced-motion` must collapse narrative motion to immediate state changes.

## Accessibility and RTL

- Minimum 44px targets for primary touch controls.
- Visible keyboard focus on every action.
- Arabic source order follows RTL reading order; Latin numbers/SKUs use local `dir="ltr"` only.
- Text is never embedded into catalog imagery.
- Normal body text meets WCAG AA contrast.
- Interactive hotspots work by click and keyboard, not hover alone.

## Performance and content gates

- Keep the initial hero copy accessible before interaction and ship an optimized local film or poster fallback.
- Hero interaction code stays isolated from catalog and quote bundles.
- Genuine 3D loads only after interaction and only when an approved model exists.
- Production pages continue to require verified products and approved assets.
- Never replace missing approved data with fabricated statistics, materials, dimensions, projects, or contact information.
