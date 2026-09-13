# HATAB Furniture ERP

Arabic-first office-furniture storefront, quotation workflow, and internal ERP built with Next.js 16, React 19, Prisma, and SQLite/libSQL.

## Local setup

1. Copy `.env.example` to `.env.local` and replace every security placeholder.
2. Set `AUTH_SECRET` to at least 32 random characters.
3. Set the bootstrap `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` before seeding a new database.
4. Install dependencies and start the application:

```powershell
npm install
npm run dev
```

The storefront is available at `http://localhost:3000`; authenticated ERP access begins at `/login`.

## Daily ERP data center

After the additive data migration, administrators can open `/admin/data-management` to download per-module or complete XLSX/CSV templates, dry-run and apply daily UPSERT updates, export 24 ERP modules, and create or restore scoped logical backups.

```powershell
npx prisma generate
npm run data:migrate
npm run test:data-management
```

The migration creates a verified SQLite recovery copy before changing the schema. Every real import or restore also requires a persisted recovery artifact before its business transaction starts. See [the data-management runbook](docs/DATA_MANAGEMENT.md) for module coverage, limits, backup scopes, and production storage requirements.

## Existing databases

Back up `dev.db`, then run the idempotent Phase 0 security migration once:

```powershell
npm run security:migrate
npx prisma generate
```

The migration hashes legacy plaintext passwords with scrypt and requires every migrated account to change its password before using ERP APIs.

## Local administrator recovery

Back up `dev.db`, stop the application process, and run the recovery command from the project root:

```powershell
npm run admin:reset
```

The command updates only `admin@hatab.local`, restores its active `ADMIN` role, requires an immediate password change, and prints a cryptographically random temporary password once. It never creates, deletes, or changes another account. Sign in with the temporary password, complete `/admin/security`, and do not store the temporary value in source files or shared logs.

Rotate `AUTH_SECRET` to a unique value of at least 32 characters and restart the application after a recovery so previously issued sessions are invalidated.

## Security model

- Admin pages and non-public APIs require a signed, HTTP-only, same-site session cookie.
- Public API access is limited to active catalog/category/collection/portfolio reads and quote submission.
- Unsafe authenticated API methods require an `ADMIN` or `MANAGER` role by default.
- Cross-origin authenticated mutations are rejected.
- Quote payloads validate customer fields, active product IDs, quantities, and request frequency.
- `AUTH_SECRET` is mandatory in production. The development fallback must never be used for deployment.

## Quality commands

```powershell
npm run typecheck
npm run test:phase0
npm run lint
npm run build
```

The repository contains pre-existing lint debt. New Phase 0 authentication and security files should pass targeted lint even while the broader cleanup is completed.

## Phase 0 operational checklist

- Replace placeholder company contact fields with verified HATAB details.
- Change the migrated administrator password at `/admin/security`.
- Configure a production database, backup policy, HTTPS, and a unique `AUTH_SECRET` before deployment.
- Use a shared rate-limit store when running more than one application instance.
- Never commit `.env`, `.env.local`, database files, or credentials.
