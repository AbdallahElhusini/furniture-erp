# First-party storefront analytics

HATAB records a deliberately small set of first-party storefront events so the
team can improve navigation and the quote journey without invasive tracking.

## Collected

- Anonymous random session UUID, first/last timestamps, landing and last path.
  A session rolls over after 30 minutes without an interaction and is kept only
  in a short-lived first-party cookie plus the current tab's session storage.
- Page views with query strings and fragments removed.
- Section dwell only after at least three seconds at 50% visibility; raw scroll
  coordinates, mouse movement, and session replay are not collected.
- Form start/submit signals, cart counts, project-board counts, and successful
  quote IDs. Form values, project notes, contact data, and search text are never
  copied into analytics metadata.
- Coarse device class, browser language, external referrer hostname, and
  allow-listed `utm_source`, `utm_medium`, and `utm_campaign` labels.

## Privacy and retention

- No IP address, full referrer URL, advertising click ID, user-agent string,
  fingerprint, or third-party analytics cookie is stored.
- Global Privacy Control, Do Not Track, and the local
  `hatab_analytics_opt_out=true` flag disable collection.
- Anonymous sessions are deleted after 400 days by default. Set
  `ANALYTICS_RETENTION_DAYS` to a value between 30 and 730 to change this.
- Public ingestion is same-origin, allow-listed, size bounded, rate limited, and
  validated again on the server.

## Operations

Run `npm run analytics:migrate` and `npx prisma generate` after deployment. The
migration creates a timestamped database backup before adding the tables.
Analytics are available at `/admin/analytics` to authenticated ERP users.

## Meta / Facebook ads readiness

The analytics dashboard reports readiness for `META_PIXEL_ID`,
`META_CAPI_ACCESS_TOKEN`, test mode, and the master `META_ADS_ENABLED` switch.
The access token remains server-only and the API returns booleans, never IDs or
secrets. All switches default to disabled.

The current build intentionally does **not** load Meta Pixel or call Conversions
API because a dedicated marketing-consent control is not present yet and the
current Content Security Policy blocks those domains. Before activation:

1. Add explicit granular marketing consent and withdrawal, while continuing to
   respect GPC and Do Not Track.
2. Map only meaningful events: product view to `ViewContent`, cart add to
   `AddToCart`, and a server-confirmed quote to `Lead` or `Contact`.
3. Generate one random `event_id` per action and send the same `event_name` and
   `event_id` through browser Pixel and server CAPI for deduplication.
4. Do not send project notes or contact fields through the first-party analytics
   payload. Any future advanced matching must have a documented legal basis and
   use Meta's required normalization and hashing on the server.
5. Add only the exact Meta script, image, and connection hosts to CSP, and only
   when the integration is enabled in production.
