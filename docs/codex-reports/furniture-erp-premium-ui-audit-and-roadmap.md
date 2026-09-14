# Furniture ERP — Full Audit and Premium UI/UX Execution Blueprint

**Project audited:** `C:\Users\Abdallah\.gemini\antigravity\scratch\furniture-erp`  
**Audit date:** 24 August 2026  
**Scope:** storefront, ERP/admin, catalog and content model, search, quote journey, visual identity, motion, accessibility, SEO, security, engineering quality, and a phased implementation plan.

**Execution status, 24 August 2026:** Phase 0 security/quote/public-data repairs and Phase 1 catalog foundation are implemented. Phase 1 preserved all 597 products, added canonical taxonomy and redirects, candidate families, structured assets, controlled tags, unpublished collection drafts, completeness scoring, and paginated search. See the companion Phase 0 and Phase 1 execution reports for verified results and the remaining owner/deployment actions.

## Executive verdict

The product has a useful operational core and a large image library, but it is not ready for a premium visual reskin yet. The highest-value route is:

1. Repair the quote, authorization, catalog, and content foundations.
2. Normalize the 597 imported records into real product families, variants, assets, categories, tags, and collections.
3. Establish one HATAB visual system across storefront and ERP.
4. Rebuild discovery around paginated search, filters, collections, spaces, and product stories.
5. Add the premium “liquid” layer through restrained transitions, a floating quote tray, a guided office-planning board, finish swatches, compare, and room/package configuration.

The north star should be **“a premium Egyptian contract-furniture showroom, project configurator, and operational ERP in one system.”** It should feel editorial and calm to a visitor, decisive and data-rich to a designer or procurement buyer, and fast and dependable to the internal team.

This is an execution plan, not only a design wishlist. It orders the work so that the premium UI is built on reliable product data and working commercial flows.

## What was inspected

- 86 source, Prisma, and script files containing approximately 18,126 lines, plus route/config files.
- All storefront and admin routes, the Prisma schema, APIs, database seed/import scripts, design tokens, and shared components.
- The running application: home, catalog, category catalog, product detail, collections, portfolio, quote basket, admin dashboard, and admin catalog.
- Database completeness and category distribution.
- Image volume, dimensions, formats, file sizes, and exact duplicates.
- Type checking, linting, accessibility signals, SEO implementation, and core performance characteristics.
- A broad benchmark set covering Steelcase, Herman Miller, Haworth, Vitra, Humanscale, Kinnarps, IKEA Business, Branch, MA.KE, SHM, Bugti, El Helow, Exact, Scale, and Prooffice.

## Current-state scorecard

These are directional readiness scores based on the audited implementation, not user-research scores.

| Area | Current | Main reason |
|---|---:|---|
| Operational ERP breadth | 6/10 | Projects, tasks, Kanban, quotes, suppliers, logistics, reports, and export foundations exist. |
| Visual consistency | 3/10 | Storefront red/cream and admin/category navy/gold behave like separate products. |
| Product content | 1/10 | Most imported rows lack commercial copy, specifications, price, and structured attributes. |
| Discovery and search | 2/10 | All products render together; search is literal and unranked; no useful facets. |
| Conversion journey | 2/10 | Quote basket exists, but its client/API contract is broken. |
| Performance readiness | 1/10 | 597-item pages, raw large images, and very large DOMs. |
| Security readiness | 0/10 | Admin and mutating APIs are unauthenticated; a plaintext seed password exists. |
| Accessibility | 3/10 | RTL is present, but labels, focus support, contrast, and reduced motion need work. |
| SEO | 2/10 | Only limited metadata exists; product URLs and structured data are absent. |
| Engineering maintainability | 3/10 | TypeScript passes, but lint debt, `any`, and monolithic pages are substantial. |

## Strong foundations worth preserving

- The Arabic RTL base and Tajawal-led interface direction.
- The quote-basket concept; it is the right primary conversion model for contract furniture.
- Admin dashboard, project timeline, Kanban, supplier, logistics, and reporting concepts.
- The existing ERP domain model and Excel import/export work.
- The large real product-image library, once it is cleaned, deduplicated, and regrouped.
- HATAB’s wine-red and green brand cues, refined into a quieter, more accessible system.

## Critical findings

### P0 — commercial and security blockers

1. **The quote submission contract is broken.** The storefront sends `phone`, `email`, `companyName`, and `notes`; the API expects `clientPhone`, `clientEmail`, `company`, and `message`. A real quote request therefore fails validation.
2. **The cart shape is inconsistent.** Product data is flattened when added, while the quote screen reads `item.details`. The basket displays generic `ITEM` labels and loses SKU/category/image context.
3. **There is no authentication, session, middleware, or role authorization.** The admin UI and all 62 API handlers are effectively exposed.
4. **Mutating handlers are unauthenticated.** A `/api/fix` GET endpoint changes product state, violating safe HTTP behavior and creating a serious operational risk.
5. **The seed contains a plaintext admin password (`admin123`).** The admin shell also displays a hard-coded identity.
6. **There is no runtime schema validation, rate limiting, CSRF strategy, audit log, or permission model.**
7. **SQLite is hard-coded to a local `dev.db` based on the process directory.** This bypasses environment configuration and is unsuitable for production concurrency, backup, and deployment.

### Catalog and data integrity

The database contains 597 catalog rows, but the import pipeline has treated image files as products rather than treating them as product assets.

| Data condition | Count |
|---|---:|
| Catalog items | 597 |
| Categories | 22 |
| Collections | 0 |
| Active products | 597 |
| Featured products | 8 |
| Missing Arabic description | 569 |
| Missing English description | 569 |
| Selling price equal to zero | 569 |
| Missing dimensions | 569 |
| Missing material | 569 |
| Missing color | 569 |
| Missing images | 28 |
| Missing specifications | 597 |

Additional issues:

- 569 imported images were converted into 569 generic `Product SKU` records.
- Raw and legacy categories overlap: for example, `executive-desk`/`executive-desks`, `meeting-table`/`meeting-tables`, and `Cabinet`/storage.
- English category labels appear inside an Arabic browsing experience.
- The database has no tags and no collection memberships.
- Names, descriptions, dimensions, specifications, availability, finishes, documents, and SEO are not complete enough for premium product pages.
- The current product model cannot cleanly express a family, multiple models, size/finish variants, or multiple media assets.

### Image library

- `src/assets` and `public/uploads` each contain 569 image files, duplicating roughly 653.6 MiB in each location—about 1.3 GiB combined.
- 546 files are PNG; many are photographic images that should use optimized WebP/AVIF derivatives.
- 449 images exceed 1 MiB.
- The 569 files resolve to 530 unique hashes: 39 exact duplicate pairs/groups, or 39 immediately removable redundant files.
- Raw `<img>` is used instead of a responsive image pipeline.
- Product images need to be assigned as gallery angles to product families/models, not as individual products.

### Storefront experience

- The identity is mixed: HATAB brand assets coexist with “Elite Furnishings,” placeholder contact information, and unsupported proof claims.
- The home hero is visually heavy and under-composed; it lacks a strong product/space image and a clear editorial story.
- Literal mojibake such as `????` is visible on product cards and the collections page.
- Featured products are generic imported cabinet records, reducing confidence immediately.
- The portfolio contains four records, but cards have missing imagery.
- Product detail pages are mostly empty because descriptions, galleries, specifications, dimensions, materials, variants, documents, and recommendations are absent.
- `/catalog` and `/catalog/[category]` use different design languages and duplicated browsing logic.
- Collections are linked in the public navigation even though there are no collections.
- Proof claims are inconsistent with the database: “180+ products” versus 597 rows and “500+ projects” versus four portfolio records.

### Search and catalog performance

- `/catalog` renders all 597 products at once: approximately 8,879 DOM nodes, 597 product links, 570 images, and an 83,593-pixel document in the inspected run.
- The admin catalog also renders the entire catalog at once.
- Every search keystroke triggers navigation; there is no debounce.
- Matching uses database `contains` across a few fields with no typo tolerance, Arabic normalization, synonyms, ranking, suggestions, analytics, or zero-result recovery.
- There is no server pagination, windowing, or stable filter/sort URL contract.

### Engineering quality

- `npx tsc --noEmit --incremental false` passes.
- `npm run lint` reports 254 issues: 133 errors and 121 warnings.
- The largest sources are difficult to evolve safely: project detail is 1,569 lines, Excel export 1,030, admin catalog 742, sync engine 729, suppliers 710, and the shared types file 684.
- The dominant lint problems include 110 explicit `any` uses and 108 unused variables.
- There are no automated tests or meaningful project runbook; the README remains the framework starter text.

### Accessibility and SEO

- Icon-only controls often lack accessible names; there is no skip link or reduced-motion handling.
- The current light green accents do not reach WCAG AA for normal text on white; the darker wine red does.
- Mobile needs real-device visual QA; the audit inspected responsive code but could not reliably emulate a mobile viewport in the local browser session.
- There is no robots file, XML sitemap, web manifest, Open Graph/Twitter strategy, product JSON-LD, canonical strategy, or Arabic/English `hreflang` structure.
- Product URLs use numeric IDs rather than durable descriptive slugs.

## Benchmark synthesis

The goal is not to clone another company. These references reveal useful patterns to translate into HATAB’s own lighter identity.

| Reference | Pattern to adopt |
|---|---|
| [Steelcase](https://www.steelcase.com/) and its [planning resources](https://www.steelcase.com/resources/planning-ideas/) | Organize around products, spaces, planning ideas, and professional CAD/Revit/finish resources. |
| [Herman Miller store](https://store.hermanmiller.com/home-office?lang=en_US) | Rich facets, color swatches, availability, grid controls, designer/collection discovery, wishlist, and optional 3D. |
| [Haworth](https://www.haworth.com/na/en/products.html) | Workspace systems, clear commercial product information, and comparison. |
| [Vitra Workspace](https://www.vitra.com/en-us/product/rooms/workspace) | Calm light editorial storytelling, strong photography, generous whitespace, product inspiration, and professional tools. |
| [Humanscale](https://www.humanscale.com/products) | Ergonomic benefit-led categorization, build/configure flows, sustainability, and specification resources. |
| [Kinnarps](https://www.kinnarps.com/products/) | Variants and colors embedded in holistic workplace/project stories. |
| [IKEA Business](https://www.ikea.com/us/en/ikea-business/office-furnishings/) | Cohesive systems, warranties, self-service planning, and assisted design services. |
| [Branch office quiz](https://www.branchfurniture.com/pages/quiz) | A light, low-friction guided journey through office type, headcount, rooms, and timeline. |
| [MA.KE](https://makeoffices.space/) | Named furniture systems, products in motion, strong manufacturing proof, and an office area/team-size calculator. |
| [Exact](https://exacteg.com/) | Regional quotation behavior including BOQ/floor-plan upload. |
| [El Helow](https://elhelow.com/) and [Bugti](https://bugtifurniture.com/en) | Regional use of families, series, collections, room looks, and quote-led conversion. |

## Proposed product positioning and information architecture

### Public experience

1. Home
2. Products
3. Collections
4. Spaces & Solutions
5. Projects
6. Design Your Office
7. Resources
8. About HATAB
9. Quote / Project tray

### ERP

1. Overview
2. Sales & CRM — leads, clients, quotes
3. Projects — stages, tasks, documents, installation
4. Products — catalog, categories, collections, tags, media, data quality
5. Procurement — suppliers, purchase state, lead times
6. Operations — assignments, logistics, installation
7. Finance
8. Reports
9. Settings — team, roles, taxonomy, integrations, audit log

The public and ERP surfaces should share tokens and primitives but have different density modes: spacious/editorial for the showroom and compact/operational for ERP.

## Premium light identity

### Design principles

- **Quiet confidence:** large whitespace, deliberate type hierarchy, restrained color, excellent photography.
- **Furniture first:** product silhouettes, materials, finishes, and real spaces carry the interface.
- **Useful motion:** movement explains state, hierarchy, and progression; it never competes with products.
- **Arabic-first, bilingual-ready:** correct RTL mechanics with designed Arabic typography, not mirrored English layouts.
- **A system, not page styling:** one token library and component set across storefront and ERP.

### Suggested color tokens

| Token | Value | Use |
|---|---|---|
| Canvas | `#FBFAF7` | Warm premium background |
| Surface | `#FFFFFF` | Cards, sheets, navigation |
| Ink | `#171411` | Primary text |
| Muted ink | `#716A64` | Supporting text |
| Hairline | `#E7E2DC` | Quiet borders and dividers |
| HATAB wine | `#9C3B40` | Primary CTA and signature moments |
| Deep wine | `#762B30` | Pressed states and strong text |
| Eucalyptus | `#3E6650` | Accessible secondary accent |
| Sage mist | `#E9F0EB` | Soft filters, badges, context panels |
| Timber | `#8A5C37` | Warm material cue, used sparingly |

Do not use pale green for body text. Preserve AA contrast and reserve wine/green for meaning rather than decoration.

### Typography and layout

- Retain Tajawal for UI continuity; test IBM Plex Sans Arabic or Noto Kufi Arabic for editorial/display headings before final selection.
- Pair Arabic with a restrained Latin grotesk such as Instrument Sans or Inter.
- Use an editorial 12-column grid, strong baseline rhythm, and a maximum content width around 1,360–1,440 px.
- Product grids should use generous imagery and very little chrome. Use 16/24 px radii selectively; not every region needs to be a floating card.
- Create density tokens so admin tables and filters remain efficient.

## Motion and “liquid/flying board” system

“Liquid” should describe connected state changes, not decorative blobs everywhere.

### Core behaviors

- 220–320 ms spring-like transitions for filters, trays, card expansion, and page continuity.
- Shared-layout transitions from product card to product detail and from “Add to project” to the quote tray.
- A morphing filter chip row that becomes a mobile bottom sheet.
- An always-available project tray that gently docks selected products, quantities, finishes, and rooms.
- A **flying planning board**: room boards accept product cards, snap them into zones, total seats/area/budget, and become a shareable quote brief.
- Slow 8–14 second ambient movement in one hero focal layer only: finish chips, image mask, or material swatch—not constant UI motion.
- Subtle depth on photography and material swatches, with no repeated shine animation.
- `prefers-reduced-motion` support that preserves state clarity without movement.

Motion rule: at most two animated focal elements in a viewport. Every transition must improve orientation, feedback, or delight without delaying the task.

## Catalog taxonomy and tag plan

### Canonical category tree

1. **Seating**
   - Task & ergonomic
   - Executive
   - Conference & visitor
   - Waiting & beam
   - Counter & stools
   - Lounge & sofas
2. **Desks & Workstations**
   - Operative desks
   - Executive desks
   - Height-adjustable desks
   - L-shaped & corner desks
   - Bench workstations
   - Reception counters
3. **Tables**
   - Meeting & conference
   - Training
   - Café & breakout
   - Coffee & side tables
4. **Storage**
   - Cabinets & credenzas
   - Filing & drawers
   - Bookcases & shelving
   - Lockers
5. **Space Division & Acoustics**
   - Partitions & screens
   - Booths & pods
   - Acoustic products
6. **Accessories & Power**
   - Cable management
   - Monitor arms
   - Power & data
   - Task lighting

### Controlled tag groups

| Group | Values/examples |
|---|---|
| Space | Executive office, open plan, meeting room, boardroom, reception, waiting, focus, collaboration, training, home office, café/lounge, education, healthcare |
| Style | Soft minimal, contemporary, executive luxury, Scandinavian light, warm timber, industrial, classic, monochrome, organic |
| Material | MDF/HDF, HPL/laminate, veneer, solid wood, steel, aluminum, glass, mesh, fabric, leather/PU, acoustic felt |
| Finish/color | Walnut, oak, ash, white, black, graphite, greige, beige, green, wine, custom RAL |
| Feature | Ergonomic, adjustable height, adjustable lumbar/arms/headrest/seat depth, cable management, integrated power, modular, mobile, stackable, lockable, acoustic, easy-clean |
| Commercial | Locally made, quick ship, made to order, warranty term, MOQ, BIFMA, FSC |
| Capacity | 1, 2, 3, 4, 6, 8, 10+, compact, standard, large |
| Geometry | Straight, L-shaped, round, oval, boat, modular |

Tags must be curated values, not a free-text dumping ground. Each group needs Arabic and English labels, stable slugs, sort order, usage rules, and an owner.

### Launch collections

- Executive Presence
- Agile Teams
- Quiet Focus
- Boardroom
- Welcome Lounge
- Reception Flow
- Compact Office
- Warm Walnut
- Light Oak
- Graphite Tech
- Soft Minimal
- Quick Ship

Each collection needs a story, cover and space photography, included product families/variants, recommended room layouts, related project, downloadable specification sheet, and quote CTA.

## Required product information model

Separate the current flat row into these concepts:

- **Product family:** shared story, category, style, benefits, sustainability, and related spaces.
- **Product model:** a sellable model under the family, with its own shape/size/function.
- **Variant/SKU:** exact finish, dimensions, options, price/cost, availability, MOQ, and lead time.
- **Asset:** image/video/360/diagram with role, angle, color/variant link, alt text, ordering, rights, and focal point.
- **Category:** hierarchical and canonical.
- **Tag and tag group:** controlled facets with bilingual labels.
- **Collection:** curated editorial grouping or coordinated set.
- **Option/option value:** finish, base, top, upholstery, mechanism, power module, and other configurable choices.
- **Material/finish/color:** reusable swatches with images and codes.
- **Structured dimensions:** width, depth, height, seat height, unit, weight, and package dimensions.
- **Document:** spec sheet, warranty, certificate, assembly instructions, CAD, BIM/Revit.
- **Availability:** made-to-order/quick-ship state, lead-time range, stock visibility policy.
- **Certification:** BIFMA, FSC, fire rating, or other verified proof.
- **Translation:** Arabic and English content per content entity.
- **SEO/search document:** slugs, titles, descriptions, keywords, normalized searchable text, ranking signals.

Replace serialized image/specification strings with validated structured storage and real relations where querying is required. Add stable slugs and an archival state; do not hard-delete catalog history referenced by quotes/projects.

## Data recovery and enrichment workflow

1. Back up the database and image library; generate immutable source IDs and hashes.
2. Detect exact duplicates, then use visual similarity/manual review to group angles of the same model.
3. Build a review table mapping every current row to family, model, category, asset role, and keep/merge status.
4. Merge duplicate categories into the canonical tree with redirect mappings for old URLs.
5. Import manufacturers’ product names/SKUs only from verified catalogs or internal records; do not invent specs.
6. Fill the minimum publishable product contract: bilingual name, category, at least three images where available, concise description, benefits, structured dimensions, material/finish, lead time, warranty, and quote status.
7. Add controlled tags and collection memberships in bulk, with editorial review.
8. Generate image derivatives and alt text; retain the original once in object storage.
9. Publish only records above a completeness threshold; keep incomplete imports in a “Needs enrichment” admin queue.
10. Track provenance and last-reviewed date for every commercial field.

Recommended completeness score:

- 30% identity: verified family/model/SKU/category.
- 25% media: hero, gallery, alt text, asset roles.
- 20% specifications: dimensions, materials, options.
- 15% commerce: lead time, MOQ, availability/price visibility.
- 10% content/SEO: bilingual copy, slug, metadata.

Do not expose products below 70%; require 90% for featuring.

## Search architecture

### Phase 1

- Server-side pagination at 24 products, with an optional 48-product density.
- 250–350 ms debounced query; cancel stale requests.
- Stable URL state for query, categories, tags, finishes, availability, sort, and page.
- Weighted ranking: exact SKU → exact model/family name → prefix name → category/tags → description.
- Arabic normalization for alef forms, ya/alef maqsura, ta marbuta where appropriate, diacritics, tatweel, and Arabic/Western digits.
- A bilingual synonym dictionary, for example: `مكتب ↔ desk/workstation`, `كرسي ↔ chair/seating`, `دولاب ↔ cabinet/storage`, `كاونتر ↔ reception counter`, `طاولة ↔ table`, `شبك ↔ mesh`, `تنفيذي/رئاسي ↔ executive`.
- Suggestions grouped into products, categories, collections, spaces, and recent searches.
- Zero-result recovery with corrected spelling, broader category, and quote/help CTA.
- Analytics for queries, result count, click-through, add-to-quote, and zero results.
- Use PostgreSQL full-text/trigram search or SQLite FTS5 only as an interim local solution.

### Phase 2

Adopt Meilisearch, Typesense, or Algolia when typo tolerance, fast faceting, merchandising rules, and larger traffic/catalog scale justify the operational dependency. Keep the index derived from the product database, version the search schema, and support atomic rebuilds.

## Premium feature set

### Storefront MVP

- Bilingual product discovery with category, space, collection, material, color, feature, capacity, lead-time, and availability facets.
- Product gallery, finish swatches, model/variant matrix, structured specifications, downloads, lead-time state, warranty/certifications, and related room set.
- Persistent project/quote tray with quantity, variant, room, notes, and shareable link.
- Product comparison for three or four products: dimensions, materials, features, finish options, warranty, availability, and documents.
- Complete-the-room recommendations and coordinated collection bundles.
- Saved shortlist/recently viewed, printable/shareable selection summary, and WhatsApp-assisted handoff.
- Project portfolio with real room type, challenge, solution, products used, size, year, and photography.

### Guided planner

Create a light, progressive “Design Your Office” flow inspired by the clarity of Branch and the utility of MA.KE/IKEA planning tools:

1. Home office or company.
2. Headcount and growth horizon.
3. Rooms/spaces needed.
4. Dimensions or floor-plan/BOQ upload.
5. Style, finish, and privacy preferences.
6. Budget band and delivery target.
7. Recommended room boards and product packages.
8. Adjust products/quantities/finishes on the planning board.
9. Submit a complete brief to the ERP as a qualified lead/quote.

The first version should be rule-based, explain recommendations, and save progress. 3D can follow only after the product variants and dimensional data are reliable.

### ERP enhancements

- Role-based access for admin, sales, catalog editor, procurement, project manager, installer, finance, and read-only roles.
- Catalog completeness dashboard, duplicate detection, bulk edit/tag/collection tools, import preview, validation report, and publish approval.
- Unified CRM funnel from lead → qualified → quote → revision → approved/rejected → project.
- Quote versioning, product snapshots, internal margin controls, approvals, and customer-facing PDF.
- Saved views, advanced filters, command palette, keyboard navigation, bulk operations, and dense/comfortable modes.
- Activity/audit timeline for all mutations.
- Notifications and owner/SLA states for quote response, procurement, delivery, and installation.

## SEO, accessibility, performance, and quality gates

### SEO

- Human product and collection slugs; preserve redirects after changes.
- Unique Arabic/English titles, descriptions, canonical URLs, Open Graph, and Twitter cards.
- `hreflang` for Arabic/English equivalents.
- XML sitemaps split by products, collections, categories, projects, and editorial resources; robots policy and web manifest.
- `Product`, `Offer` where appropriate, `BreadcrumbList`, `Organization`, and project/article structured data.
- Search-friendly collection/space landing pages with real copy rather than indexable filter permutations.

### Accessibility

- WCAG 2.2 AA as the release standard.
- Semantic landmarks, skip link, keyboard-visible focus, correct headings, accessible names for icon controls, form errors, and live status for quote/search updates.
- Minimum 44×44 px touch targets and tested RTL reading/tab order.
- Accessible contrast tokens and color-independent status indicators.
- Reduced-motion mode and pause controls for any autonomous media.

### Performance budgets

- LCP below 2.5 s, INP below 200 ms, CLS below 0.10 at the 75th mobile percentile.
- Keep initial route JavaScript around 200–250 KiB gzip where feasible.
- Initial catalog image transfer target: approximately 2–3 MiB, not hundreds of raw assets.
- Generate responsive AVIF/WebP, correct intrinsic sizes, blur placeholders, priority only for the real LCP image, and lazy-load the rest.
- Paginate public results at 24/48; paginate or virtualize admin rows at 50–100.
- Cache stable catalog reads and serve media through object storage/CDN.

### Test gates

- Unit tests for validators, pricing/quote calculations, data normalization, and search normalization.
- API integration tests for auth/roles and quote lifecycle.
- Browser tests for discover → filter → product → project tray → quote, plus admin login, catalog enrichment, quote conversion, project update, and export.
- Visual regression for Arabic/English desktop/mobile pages.
- Automated accessibility scans plus keyboard/manual screen-reader checks.
- Lighthouse CI, catalog query/load tests, migration rehearsal, backup/restore test, and security review before launch.

## Execution roadmap

### Phase 0 — Stabilize and decide (3–5 working days)

**Work**

- Back up data/media and document the current deployment/runtime.
- Decide the canonical brand: HATAB or Elite. The recommendation is HATAB because the existing logo/color language and requested furniture identity already point there.
- Implement authentication, sessions, password hashing, CSRF policy, and minimum RBAC.
- Protect every admin page and mutating API; remove or redesign `/api/fix`.
- Add runtime validation and a consistent error envelope.
- Repair and test the cart/quote data contract end to end.
- Remove mojibake, placeholder contact data, and unsupported proof counts.

**Exit gate:** an unauthorized visitor cannot access admin/data mutations; a real quote succeeds and creates correct line items; no plaintext/default password remains.

### Phase 1 — Product data foundation (1–2 weeks, content work may extend)

**Work**

- Introduce family/model/variant/asset/category/tag/collection schema and migrations.
- Deduplicate media and group images into products through assisted/manual review.
- Merge categories and seed the controlled taxonomy and tag groups.
- Build collection and data-completeness workflows.
- Build responsive image derivatives and move originals to one canonical store.
- Paginate APIs and admin catalog; create import preview and rollback support.
- Add slugs, translation structure, documents, commercial fields, and data provenance.

**Exit gate:** no image is masquerading as a product; every published product is ≥70% complete; featured products are ≥90%; collection pages have real content.

### Phase 2 — Unified design system (1 week)

**Work**

- Confirm mood board and three representative screens: home, catalog, product detail.
- Define color, typography, spacing, radius, shadow, density, grid, icon, imagery, motion, and chart tokens.
- Build accessible primitives: navigation, buttons, inputs, filter chips, drawers, dialog, toast, tabs, cards, tables, empty/error/loading states.
- Implement RTL and reduced-motion behavior at primitive level.
- Create Storybook or an equivalent component lab and visual regression baseline.

**Exit gate:** approved tokens and components can render both editorial storefront and dense ERP without page-specific visual systems.

### Phase 3 — Premium storefront core (2 weeks)

**Work**

- Home, global navigation, search overlay, category/collection/space pages.
- Unified paginated PLP with facets, sorting, saved URL state, mobile filter sheet, and empty states.
- Rich PDP with gallery, variants, swatches, specification/download panels, related sets, and product-to-detail transition.
- Persistent project tray and repaired multi-step quote flow.
- Projects, resources, about, contact, bilingual SEO, sitemap, and structured data.

**Exit gate:** every main discovery/conversion journey passes desktop/mobile, RTL/LTR, accessibility, performance, and analytics checks.

### Phase 4 — Differentiating UX (1–2 weeks)

**Work**

- Product compare and complete-the-room bundles.
- Guided office planner and flying room boards.
- Headcount/area calculator, floor-plan/BOQ upload, package recommendations, and saved/shareable brief.
- Calibrated liquid motion, shared-layout transitions, and quote-tray choreography.

**Exit gate:** planner output creates a qualified ERP lead/quote with complete inputs; motion passes reduced-motion and performance gates.

### Phase 5 — ERP refinement (1–2 weeks)

**Work**

- Apply the unified design system and compact density to ERP.
- Split monolithic pages into domain components and typed services.
- Add CRM stages, quote versions/approvals, catalog QA, bulk operations, saved views, command palette, audit history, and role-aware navigation.
- Standardize loading, empty, error, success, destructive confirmation, and responsive states.

**Exit gate:** key staff tasks complete without raw database/API work; all mutations are authorized and audited; lint/type/test gates pass.

### Phase 6 — Launch hardening (1 week)

**Work**

- Full content QA, browser/device matrix, accessibility review, security review, performance tuning, and load tests.
- Analytics dashboards and event-quality verification.
- Migration rehearsal, backup/restore, monitoring, error tracking, deployment runbook, and staff training.
- Staged launch with rollback plan and a two-week observation window.

**Exit gate:** P0/P1 defects are closed, budgets hold on production-like data, restore and rollback are proven, and owners exist for content, sales, and operations.

**Indicative total:** 7–10 weeks for a focused team, excluding unusually long catalog research/approval. Product regrouping and content verification—not animation—are most likely to control the schedule.

## Prioritized backlog

### P0 — before any redesign release

- Auth/RBAC and API protection.
- Hash credentials; rotate seeded/default access.
- Repair quote/cart contract and test it end to end.
- Remove state-changing GET and protect operational data.
- Add runtime validation and structured errors.
- Decide one brand and correct visible placeholders/mojibake.
- Back up and define the product/media migration.

### P1 — premium MVP

- Normalize catalog and taxonomy; create collections/tags.
- Deduplicate/group media and implement optimization.
- Server pagination, debounced search, facets, sorting, bilingual normalization.
- Unified tokens/components and consistent storefront routes.
- Premium home/PLP/PDP/collections/projects/quote.
- Accessibility, SEO, analytics, and automated critical-path tests.

### P2 — differentiation

- Project tray persistence/share links.
- Compare, bundles, finish boards, complete-the-room.
- Guided planner, area/headcount calculator, BOQ/floor-plan upload.
- Advanced ERP catalog QA, bulk workflows, CRM/approval improvements.
- Calibrated liquid motion and flying boards.

### P3 — after validated demand

- 3D configurator/AR, only for verified dimensional/variant data.
- External search engine if native search metrics justify it.
- Customer portal, approvals, live project visibility, and reorders.
- CAD/BIM library expansion and integrations.

## Release metrics

Instrument these before the redesign so improvement can be measured:

- Search success rate, zero-result rate, result click-through, and time to first useful product.
- Product-list → product-detail conversion.
- Product-detail → project-tray and tray → quote completion.
- Quote completion time, validation failure, response SLA, revision count, win/loss.
- Planner start/completion and recommended-package acceptance.
- Published catalog completeness, duplicate rate, and stale-record count.
- Core Web Vitals by page type and device.
- Accessibility defects and task success for keyboard/RTL flows.
- ERP task completion time for product publishing, quote creation, and project updates.

## Definition of “optimal phase”

The product has reached the intended phase when:

- The brand, language behavior, and design system are consistent everywhere.
- Every published product is accurate, structured, searchable, and visually complete.
- Visitors can move from need/space to a confident shortlist and valid quote without staff intervention.
- Search is fast, bilingual, facet-rich, typo-tolerant, and measurable.
- The planner produces a usable commercial brief, not a decorative result.
- ERP users have role-appropriate, fast, auditable workflows.
- No unauthenticated mutations, default passwords, placeholder copy, mojibake, or empty public destinations remain.
- WCAG 2.2 AA, performance budgets, automated critical journeys, monitoring, backup, and rollback are release gates rather than aspirations.

## Recommended first execution slice

Start with a five-day stabilization sprint and produce these concrete outputs:

1. Canonical brand decision and product/content owner.
2. Protected admin/API with roles and rotated credentials.
3. Passing quote journey integration test.
4. Product migration map and media dedupe report.
5. Approved category/tag/collection dictionary.
6. Three approved high-fidelity reference screens using the new tokens.
7. Measured baseline for search, quote funnel, Core Web Vitals, and catalog completeness.

That slice removes the largest risks and gives the design work a dependable, measurable foundation.
