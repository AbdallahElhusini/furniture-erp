# Furniture ERP — Phase 0 Execution Report

**Completed:** 24 August 2026  
**Project:** `C:\Users\Abdallah\.gemini\antigravity\scratch\furniture-erp`

## Outcome

The stabilization slice is implemented. The storefront remains public, while ERP screens, commercial data, reports, and mutations now sit behind a signed administrator session. The broken cart-to-quote contract is repaired and verified against the real database.

## Implemented

- Signed, HTTP-only, same-site, eight-hour administrator sessions.
- `/login` and forced `/admin/security` password-rotation journeys.
- Scrypt password hashing, constant-time verification, password policy, login throttling, and disabled-user checks.
- Proxy-level protection for `/admin` and private APIs.
- Route-level protection for every non-public API handler.
- Default write authorization restricted to `ADMIN` and `MANAGER` roles.
- Same-origin enforcement for authenticated mutations.
- Public API allow-list limited to storefront catalog/category/collection/portfolio reads and quote submission.
- Removed the state-changing `/api/fix` GET endpoint.
- Removed cost price, supplier phone/contact data, project references, quote references, and customer names from public catalog responses.
- Corrected storefront quote field names to the canonical API contract.
- Backward-compatible quote input aliases for old clients.
- Quote validation for name, phone, email, product IDs, active state, quantities, payload size, and request frequency.
- Duplicate quote lines are consolidated safely.
- Cart data now uses one typed shape and migrates old local-storage entries.
- Quote basket now shows SKU, category, product image, quantity, and accessible controls.
- Added the previously missing email field to the quote form.
- Replaced visible mojibake on product cards and collections.
- Added a designed empty state for collections instead of a blank public destination.
- Unified visible naming around HATAB and removed unverified phone/email/address placeholders.
- Replaced unsupported homepage proof numbers with live database counts.
- Added the collections and account-security destinations to ERP navigation.
- Added logout and accessible notification/quantity/remove control labels.
- Updated seed logic so a strong environment-supplied password is mandatory and stored only as a hash.
- Added `.env.example`, a real project README, typecheck/test/migration commands, and an idempotent security migration script.
- Added an isolated Next.js build directory option for verifying production builds while development is running.

## Database action

- Backed up the live `dev.db` before mutation.
- Added `User.mustChangePassword`.
- Migrated the existing administrator password from plaintext to a salted scrypt hash.
- Marked the existing administrator for mandatory password rotation.
- Verified: one user, zero plaintext passwords, one pending forced rotation.

Backup location:

`C:\Users\Abdallah\Documents\Codex\2026-08-24\c-users-abdallah-gemini-antigravity-scratch\work\furniture-erp-backups\dev-before-phase0-20260824-010632.db`

## Verification results

| Check | Result |
|---|---|
| TypeScript | Pass |
| Phase 0 security tests | 3/3 pass |
| Targeted lint for new auth/quote/cart code | Pass |
| Production build | Pass; 34 static pages generated and all dynamic routes compiled |
| Anonymous `/admin` | 307 redirect to `/login` |
| Anonymous private API | 401 |
| Public catalog data leak check | No `costPrice`; no supplier phone |
| Legacy admin login | Pass, followed by forced `/admin/security` redirect |
| Private APIs before password rotation | 403 |
| Weak replacement password | Rejected |
| Valid quote creation | 201 with correct product and quantity |
| QA quote cleanup | Exact test quote removed; no test record retained |
| Live browser inspection | Home, collections, login, security, product, and quote basket verified |

The full repository lint baseline is now **241 findings: 126 errors and 115 warnings**, down from the audited 254. This remaining debt is pre-existing and belongs in the engineering cleanup stream; the newly added Phase 0 authentication, session, password, login, quote, and cart slice passes targeted lint.

## Required owner action

1. Sign in with the existing local administrator account.
2. Complete the forced password change at `/admin/security` before using ERP tools.
3. Add a unique 32+ character `AUTH_SECRET` to the deployment environment.
4. Supply verified HATAB phone, email, and address values before publishing contact details.
5. Restart the long-running development process when convenient so every in-memory Prisma module uses the regenerated client; hot-reloaded flows already passed, but a clean restart is the correct handoff state.

## Next execution slice

Proceed to Phase 1: normalize the catalog into product families/models/assets, merge duplicated categories, add controlled tags and launch collections, implement data-completeness scoring, deduplicate/regroup media, and introduce server pagination before beginning the premium storefront rebuild.
