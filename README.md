# sawaddikanthali — SMART CANTEEN

Phase 1 foundation. **Not approved for real money / production.** Initial target folder existed and was empty. Initial development preserved existing user data. Git publication was subsequently requested by the owner.

## Start on Windows

1. Install Node.js 24 LTS and pnpm. Finish WSL installation and restart if requested. Start Docker Desktop and wait for its engine.
2. In this folder copy `.env.example` to `.env` (never commit it).
3. Generate separate random secrets for AUTH_SECRET, OTP_PEPPER and SANDBOX_WEBHOOK_SECRET, each at least 32 bytes, with your password manager. Do not paste them into chats/logs.
4. `pnpm install --frozen-lockfile`
5. `docker compose up -d postgres`
6. `pnpm db:generate` then `pnpm db:migrate` then `pnpm db:seed`.
7. Configure Google, Resend and Upstash below. `pnpm dev`; open http://localhost:3000 .

Use pnpm scripts, not global Prisma. Node's local runtime in Codex may not provide npm; pnpm is available. Development seed creates counter-1 only, no fake users, money or login bypass. Complete Google registration before using trusted operator command `pnpm exec tsx scripts/grant-staff.ts email@example.com EMPLOYEE` (or SUPERVISOR). No public role assignment exists. Restrict database access and operator commands to trusted administrators.

## What you must create / supply

- Google Cloud project: OAuth consent screen and Web OAuth client. Authorized origin http://localhost:3000 ; callback http://localhost:3000/api/auth/callback/google . Add test users while consent app is in testing. Set AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET. Production callback must use your real HTTPS domain. Verified email is required; provider subject is unique. No username/password registration.
- Resend account + verified sender domain (DNS records): set RESEND_API_KEY and EMAIL_FROM. OTP is six digits, five minutes, one use, five attempts, cooldown 60 seconds. Google email OTP is additional verification, not independent MFA. Delivery requires a real test mailbox/provider test.
- Upstash Redis REST database: set URL/token. Shared limiting fails closed if missing; do not remove it to make login or payment work.
- PostgreSQL: compose is local only with a clearly local password. For production create a managed instance, TLS, connection pool, separate migration/runtime roles, backups and PITR. Never expose local database port publicly.
- Payment provider merchant/sandbox account supporting dynamic PromptPay and signed callbacks. There is currently **only a development sandbox adapter**, no production PromptPay adapter, bank routing or real bank QR. Do not use a phone-number static QR as member matching. Biller references require provider support.
- Deployment account/domain; optional R2/Supabase Storage and Sentry are later integrations, not currently active.
- RFID equipment only for Phase 3. No UID-only authorization and no browser Web NFC dependency.

## Sandbox walkthrough

PAYMENT_MODE=sandbox, development server only. Member creates a topup intent in Wallet. It displays a test reference, **not a bank QR**. In a second trusted terminal run:

`pnpm exec tsx scripts/sandbox-settle.ts INTENT_ID 10000`

This signs an explicit simulated THB 100 event and calls the webhook. The wallet changes only after server/database commit. Open staff POS, open counter-1 shift, enter total, confirm amount, scan the member QR with a keyboard-wedge scanner or decode/paste its opaque token, inspect member preview and confirm. There is no product cart. Fresh member QR expires in 60 seconds and is single-use. A new QR revokes previous live QR tokens.

Never automatically recreate a charge with a new key after a network error. Use the same key and inspect staff history. Camera scanning and PWA are not implemented yet. Pending POS payloads are saved in sessionStorage for same-tab refresh recovery with the original key. Closing a tab/browser, clearing storage, switching device or account still requires staff-history/operator reconciliation.

## Checks

`pnpm check`, `pnpm test`, `pnpm build`.

Default tests skip database tests visibly unless RUN_DB_TESTS=1. Database tests require a **separate disposable database named canteen_test**. Do not point them at a real member database.

Create canteen_test, set DATABASE_URL to it, run migrations. Then `$env:RUN_DB_TESTS='1'; pnpm test:db`. Tests retain audit/ledger records intentionally because those are immutable. They create unique synthetic users/transactions and never clean financial rows by deletion. Use only a disposable test database. Repeated runs are isolated by random IDs.

## Current scope / release blockers

Implemented: architecture/ERD/sequences, Next.js server routes, Google Auth.js configuration, email OTP server flow, contact collection, member wallet/history/QR, signed sandbox settlement, integer double-entry service, conditional balance debit with serializable retry, one-use tokens, manual amount POS, shifts, staff history, approved supervisor refund API, audit records, PostgreSQL schema/migrations/financial triggers and test suites.

Incomplete: admin MFA enrollment/re-authentication and admin dashboard/management (blocked deliberately), production PromptPay adapter and settlement reconciliation, refund request/approval UI (supervisor API approval only), settlement after intent expiry operational workflow, camera scanning, notifications/outbox, email delivery retry job, automatic pending-intent expiration worker, reporting/export, hardware/card provisioning, storage/monitoring, PWA, production backup/restore and full accessibility/browser/e2e suite. Dynamic production QR therefore remains a launch blocker. A working local financial foundation does not mean all Phase 1 acceptance criteria are complete.

See docs/ARCHITECTURE.md, docs/API.md, docs/SECURITY.md and docs/DEPLOYMENT.md. Verification results are in docs/VERIFICATION.md.
