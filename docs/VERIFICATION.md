# Verification — 2026-11-01 (Asia/Bangkok)

Initial inspection: C:\Users\boatz\Videos\sawadikan existed and contained zero entries. Existing files preserved; no Git initialization, remote or commit.

## Passed on this Windows machine

- Node 24.22.1, pnpm 11.25.0; exact dependencies in package.json and pnpm-lock.yaml. Next.js 16.4.3, React 19, Prisma 7.10.1, TypeScript 7.0.2. Auth.js v5 beta is explicitly identified as a pre-release dependency.
- `pnpm install --frozen-lockfile` succeeded after native compiler download and restored normal optional dependency installation. No compiler exclusion remains. Official SWC tarball integrity was checked against npm SHA512 during download recovery.
- Docker PostgreSQL 17 started successfully after user installed WSL. Initial schema and financial guard migrations applied to canteen and separate canteen_test databases.
- Development seed succeeded, creates counter-1 only; no mock financial balances or login bypass.
- `pnpm check` passed.
- `RUN_DB_TESTS=1`, DATABASE_URL pointing at canteen_test: `pnpm test` passed **29 tests in 4 files**, with no database tests skipped.
- `pnpm build` succeeded, including compilation, TypeScript and static/dynamic route generation.
- `pnpm audit --prod --audit-level=high`: no known vulnerabilities reported by the registry. This is not a security audit or proof of absence of vulnerabilities.
- `pnpm dev` running at http://localhost:3000 ; homepage inspected in actual Chrome. Unauthenticated POS navigation returned to homepage. Full authenticated browser journeys not yet tested.

## Test coverage boundaries

Real PostgreSQL financial tests cover duplicate concurrent webhooks, invalid signatures, amount mismatch, expiration, concurrent insufficient-balance purchases, same-key duplicate charge, changed payload conflicts, token reuse, supervisor refunds and over-refund rejection, immutable ledger rows, rejection of unbalanced postings/summary drift and wallet/ledger reconciliation.

Real PostgreSQL registration tests cover OTP attempt persistence/limit, expiration, reuse, concurrent verification, prerequisite OTP, exactly-one-wallet creation, default USER role/unverified phone, unique email/provider subject. Their Redis rate-limit boundary is mocked, not tested against real Upstash. No email is sent by these tests.

Authorization unit tests mock session/database boundaries and check cross-origin rejection, missing sessions, staff role restriction, suspended/incomplete accounts. Cryptography/money unit tests check raw-body signature tampering and integer satang validation.

## Not verified / not complete

Google credentials/login, real Resend mailbox delivery, Upstash service and distributed rate limiting, live PromptPay/provider and reconciliation, independent Admin MFA/dashboard, real scanner/camera/RFID, full mobile accessibility/e2e and POS reload/network failure browser automation, backup restore, deployment and production monitoring. No deployment occurred.

The development financial core works under the tested conditions. All Phase 1 features and production acceptance gates are not complete; follow README scope and deployment gates.
