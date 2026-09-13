# HATAB SEO, GEO and answer-engine audit

Updated: 2026-08-28

This document records the storefront's technical discovery policy. It does not
promise rankings, traffic, AI citations or rich results. Every public signal is
derived from content that is visible and cleared by the existing publication
gate.

## Implemented foundation

- Arabic uses the existing canonical paths (`/catalog`, `/product/12`). English
  uses stable `/en` paths (`/en/catalog`, `/en/product/12`). The proxy rewrites
  English URLs to the same application routes while passing the resolved locale
  to Server Components.
- Canonical, Open Graph, Twitter, robots-preview and reciprocal language signals
  are generated from `src/lib/seo.ts`.
- The sitemap contains Arabic and English canonical URLs for the home page,
  catalog, categories, verified style edits, published collections and products
  that meet the existing SEO-readiness threshold.
- Product sitemap `lastModified` values come from the product's real `updatedAt`.
  Unknown dates are omitted. Draft collections, internal projects, quote pages,
  search results and low-value filter combinations are excluded.
- The public catalog emits a truthful `CollectionPage`, `BreadcrumbList` and
  `ItemList` only on indexable listing views. Collections use the same graph.
  Portfolio intentionally emits no fake project list because no public
  publication gate exists for internal project records.
- `/quote` stays crawlable long enough for its page-level `noindex` to be read.
  Private `/admin`, `/api` and `/login` paths remain blocked and also carry
  response-level noindex protection where configured.
- Production crawl is denied and the sitemap is empty if neither
  `NEXT_PUBLIC_SITE_URL` nor `SITE_URL` contains the verified public origin.
  This prevents accidental `localhost` canonical URLs.
- `/admin/seo` reports readiness gaps and catalog-supported topic opportunities.
  Its coverage score measures catalog evidence only; it never pretends to be
  search volume, keyword difficulty or a ranking score.

## Index policy

| URL type | Policy | Reason |
| --- | --- | --- |
| Base catalog | Index | Stable inventory directory with visible copy and links. |
| One valid category | Index | Durable topic with published inventory. |
| One verified style edit | Index | Unique bilingual explanation and a deliberately coordinated product set. |
| One published database collection | Index | Explicitly active, non-draft and contains published pieces. |
| Internal search | Noindex, follow | User utility; query permutations do not form useful landing pages. |
| Price, tag and combined facets | Noindex, follow | Avoids a combinatorial index surface and duplicate listing pages. |
| Sort orders and pagination after page 1 | Noindex, follow | Consolidates signals on the primary listing. |
| Invalid slug, filter or out-of-range page | 404 | Prevents empty soft-404 listing pages. |
| Product below current SEO-readiness gate | Noindex, follow | Product remains usable without being presented as search-ready. |
| Quote journey | Noindex, nofollow | Conversion workflow, not a search landing page. |

Faceted pages remain fetchable so bots can read `noindex`. If Search Console or
Bing data later proves that crawl volume is excessive, already-removed parameter
patterns can then be blocked in `robots.txt`. Blocking and `noindex` should not be
introduced simultaneously because a blocked crawler cannot read the page meta.

## Structured-data truth rules

- `Product` belongs only on a single real product page. `Offer` is omitted when
  a verified positive price and accurate availability are absent.
- Ratings, reviews, stock, return policies, addresses, telephone numbers,
  completed projects and certifications are never inferred.
- `ItemList` lists only visible canonical items in their displayed order.
- Breadcrumb entities mirror the visible navigation hierarchy and localized
  canonical URLs.
- JSON-LD is rendered server-side and serialized with `<` escaped.
- FAQ markup is not added merely for visibility. Questions and answers must be
  visible and authored first; Google removed its FAQ rich-result feature in 2026.

## GEO and answer-engine rationale

Google states that AI search visibility uses the same foundations as Search:
indexable pages, snippet eligibility, textual content, useful internal links and
good page experience. It does not require special AI schema, Markdown mirrors or
`llms.txt`. Bing similarly emphasizes clear structure, explicit facts, fresh
sitemaps and crawlable canonical pages for search and grounding systems.

The practical HATAB strategy is therefore:

1. Keep one focused purpose per canonical page.
2. Put key facts in visible HTML rather than images or animation alone.
3. Use bilingual names, descriptions, dimensions, materials and approved image
   alt text exactly as recorded.
4. Link categories, style edits, collections and products through real anchors.
5. Publish topic pages only when the catalog supports a meaningful selection and
   editors can add unique guidance. Tag counts in `/admin/seo` identify candidates;
   they do not auto-publish thin pages.
6. Monitor actual queries, cited URLs and countries in Google Search Console and
   Bing Webmaster Tools before expanding the topic set.

## Deployment handoff

1. Set the verified HTTPS origin in `NEXT_PUBLIC_SITE_URL` or `SITE_URL`.
2. Add Google and Bing verification tokens through deployment configuration, not
   hard-coded source values.
3. Submit `/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
4. Validate representative catalog, collection and product pages with Google's
   Rich Results Test and Schema.org Validator.
5. After real public product or collection updates, configure IndexNow with a
   verified site key for Bing and participating engines. Do not ship a fabricated
   key.
6. Use Search Console and Bing performance data to decide which tag opportunities
   deserve dedicated editorial pages.

## Primary references

- Google, localized versions and reciprocal `hreflang`:
  https://developers.google.com/search/docs/specialty/international/localized-versions
- Google, canonical URL consolidation:
  https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google, faceted navigation crawl management:
  https://developers.google.com/crawling/docs/faceted-navigation
- Google, sitemap construction and accurate `lastmod`:
  https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google, ecommerce structured data:
  https://developers.google.com/search/docs/specialty/ecommerce/include-structured-data-relevant-to-ecommerce
- Google, Product structured data:
  https://developers.google.com/search/docs/appearance/structured-data/product
- Google, Breadcrumb structured data:
  https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- Google, generative-AI search optimization:
  https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Bing Webmaster Guidelines:
  https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a
- Bing, sitemaps in AI-powered search:
  https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search
- Bing, IndexNow:
  https://www.bing.com/webmasters/help/indexnow-0z209wby
- Next.js App Router metadata:
  https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js sitemap convention:
  https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
- Next.js JSON-LD guidance:
  https://nextjs.org/docs/app/guides/json-ld
- Schema.org Product, ItemList and BreadcrumbList:
  https://schema.org/Product
  https://schema.org/ItemList
  https://schema.org/BreadcrumbList

