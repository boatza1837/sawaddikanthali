# Deployment / launch gate

Do not enable real money from this foundation yet. Production sandbox is intentionally disabled.

1. Create managed PostgreSQL with TLS/pooling, least-privilege runtime user and separate migration credential. Apply reviewed Prisma migrations before application release, never prisma db push on production.
2. Configure Vercel Node.js runtime, Google production callback/consent, trusted HTTPS APP_ORIGIN/AUTH_URL, Resend sender domain, Upstash REST and independently generated secrets in secret storage.
3. Implement the selected payment provider adapter from its official API contract, test bank sandbox end-to-end, bad signatures, repeated callbacks, late settlement, refunds and reconciliation. Implement idempotent external creation and recovery.
4. Implement independent admin MFA enrollment and server-bound recent re-authentication, admin management, reconciliation/exception UI, and durable POS uncertain-request recovery. Security review before enabling administrative changes.
5. Run unit, PostgreSQL integration, browser POS/network-failure and access-control tests in CI; test real Google and email flows with controlled accounts. Live scanner/RFID tests only when hardware bridge exists.
6. Enable database backups/PITR and retention with owner policy, perform a restore to a separate instance and reconcile liabilities against ledger. Record restore duration and results. Test operational response to provider outages, pending/late payments and duplicate requests.
7. Install Sentry with PII/secrets scrubbing and availability alerts; configure secure headers/CSP and TLS. Storage integration is not required by the current UI.

Local Docker/WSl setup and test results are documented separately. Never change merchant payout account merely by editing an application setting: provider/bank approval may be necessary.
