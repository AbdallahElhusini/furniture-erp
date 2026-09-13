# HATAB ERP data center

The administrator data center lives at `/admin/data-management`. It is an explicit, audited workflow for daily spreadsheet updates, presentation exports, and trusted logical backups. It never transfers `User`, password, session, or authentication state.

## Safe deployment

Generate the Prisma client, run the additive migration, and restart the application process:

```powershell
npx prisma generate
npm run data:migrate
```

`data:migrate` is idempotent and additive. It checks duplicate legacy keys before creating unique indexes and aborts rather than dropping/recreating a table. It must be reviewed and run against the configured `DATABASE_URL`; do not use `prisma db push --accept-data-loss` for this feature.

By default recovery artifacts are written to `.data-backups/`. Production should set `DATA_BACKUP_DIR` to durable, access-controlled storage included in the server backup policy. Backups are plaintext JSON (integrity-protected, not encrypted), so the directory needs least-privilege filesystem permissions, encryption at rest from the host/storage layer, retention limits, and monitored off-host copies. If that storage is unavailable, an APPLY import/restore is intentionally blocked.

## Daily update workflow

1. Download the complete XLSX template, or a one-module XLSX/CSV template.
2. Keep `action` as `UPSERT`. `DELETE` is not supported in schema v1.
3. Give every external-key module a stable key. Exported legacy rows receive collision-free portable keys without changing the live database.
4. Upload the file and run **dry-run**. The parser, allowlist, field rules, duplicate keys, references, cycles, and every row are checked before any business transaction begins.
5. Resolve every error, dry-run again, then choose **apply**. The server first persists a lossless `FULL_BUSINESS` recovery artifact, then applies every row in one transaction and records changes.

MERGE is patch-based: a column absent from the sheet, or a blank/null cell, preserves the current value. There is no clear-value token in v1. Inserts still require the module's required values.

## Spreadsheet modules

All 24 visible modules have an allowlisted registry, template, export, validation, and UPSERT applier:

- Operations: clients, suppliers, technicians, projects, project items, supplier orders, order items, tasks, payments, quote requests, quote items, portfolio projects.
- Catalog: categories, category redirects, collections, product families, tag groups, tags, catalog items, product assets, catalog/collection links, catalog/tag links.
- Content: safe public settings and registered site-content slots.

Settings are restricted to public company identity/contact/currency/tax keys. Site content accepts only keys registered by `SITE_CONTENT_DEFINITION_BY_KEY`; group, type, label, and sort order are always reset to their canonical definitions. Media must use a verified same-origin path under `/uploads/`, `/images/`, or `/media/` with an approved renderable extension; product-asset spreadsheet rows use the narrower `/uploads/catalog/` path.

## Upload security

- Spreadsheet file limit: 15 MB; 32 sheets; 10,000 rows per sheet; 25,000 rows in a bundle; 96 columns; 20,000 characters per cell.
- XLSX ZIP entries are centrally allowlisted and then actually inflated with bounded output before ExcelJS sees the workbook. ZIP64, encryption, data descriptors, high ratios, path traversal, macros, ActiveX, external links, query connections, and embedded payloads are rejected.
- All Excel formulas, including shared formulas, are hard errors. Cached formula results are never imported.
- Numeric strings must use `1234.50` or correctly grouped `1,234.50` grammar. Ambiguous `1,50` is rejected.
- Every text cell written to XLSX/CSV that begins with `=`, `+`, `-`, or `@` (including after leading whitespace) is prefixed with an apostrophe. Existing leading apostrophes are doubled, and the importer reverses this escape, so values such as Egyptian phone numbers beginning with `+20` round-trip without corruption.
- Every endpoint calls the live ADMIN authorization guard; inactive users, role drift, forced password change, and revoked session versions are rejected.

## Backups and restore

Available scopes are `FULL_BUSINESS`, `CATALOG`, `OPERATIONS`, and `CONTENT`. A backup contains two related payloads from one database read transaction:

- `data`: portable, stable-key presentation rows with no `record_id`.
- `records`: exact non-secret scalar records, timestamps, quality/provenance fields, foreign keys, and the collection/tag joins captured at backup time.
- `bindings`: stable identity bindings between portable business keys and trusted numeric records. Restore refuses a live numeric ID whose business identity differs, and an operations-only restore additionally proves every catalog ID still maps to the exported SKU.

The envelope is SHA-256 protected and schema-versioned. Restore runs integrity, module, complete-field, count, date, foreign-key, duplicate-key, and live unique-collision preflight. A real restore then creates and persists a same-scope pre-restore backup before starting its transaction.

Restore mode is `MERGE_NO_DELETE`: included records are restored, missing captured collection/tag links are reconnected, newer links and unrelated live records are not deleted. A failure rolls the transaction back; the job is marked `FAILED` and retains the recovery artifact name when one was created. The unkeyed SHA-256 digest detects accidental/tampered bytes but is not an authenticity signature; ADMIN authorization, trusted storage, and filesystem controls provide the trust boundary.

## API surface

- `GET /api/data-management/modules`
- `GET /api/data-management/template?module=&format=xlsx|csv`
- `GET /api/data-management/export?modules=&format=xlsx|csv`
- `POST /api/data-management/import` (`multipart/form-data`)
- `POST /api/data-management/backup` (`{ "scope": "..." }`)
- `POST /api/data-management/restore` (`multipart/form-data`)
- `GET /api/data-management/jobs`

## Verification

```powershell
npm run typecheck
npx eslint src/lib/data-transfer src/app/api/data-management src/app/admin/data-management/page.tsx
node --test --experimental-strip-types tests/data-management-core.test.ts
npm run test:data-migration
npm run test:data-management-integration
```

Or run the complete suite with `npm run test:data-management`. Both migration and HTTP roundtrip tests copy the legacy database to temporary locations; they never migrate or reset `dev.db`. The integration test starts Next with an isolated database, recovery directory, and build directory, then verifies live authorization, XLSX dry-run/apply, automatic pre-import backup, audit rows, every backup scope, tamper rejection without mutation, restore dry-run, and an actual benign restore.
