# Deployment and service setup — 2026-11-01 (Asia/Bangkok)

## Completed

- Vercel Hobby project sawaddikanthali created from boatza1837/sawaddikanthali, main. Production URL: https://sawaddikanthali.vercel.app . First deployment Ready; homepage opened in Chrome.
- Build explicitly runs Prisma generate before Next.js; Node 24 pinned. Server region sin1.
- Prisma Postgres integration accepted with the user's explicit confirmation. Accepted: Vercel Integration Marketplace End User Addendum, Prisma Postgres Terms and Privacy Policy. Vercel ID/email/usage data may be shared with Prisma as disclosed by the service.
- Prisma Postgres Free plan: smart-canteen-db in Singapore. No paid plan selected. Service currently displays 100K monthly operations and 2GB included storage; verify current quotas in dashboard before launch.
- Database linked to this project. Both reviewed migrations applied successfully to the new cloud database; counter-1 provisioned with an audit record. No mock members or money created. Other project database not modified.
- Google Cloud Smart Canteen project scenic-arc-513410-p3 created. OAuth client exists. Origins are production URL and http://localhost:3000 . Redirect URIs corrected to /api/auth/callback/google for both origins.
- Resend key for Smart Canteen captured privately. Google/Resend credentials and fresh independent AUTH_SECRET/OTP_PEPPER stored in Vercel as Secret values for Production only. Ignored .env files hold local copies; no secret committed.
- PAYMENT_MODE=production set on Vercel. Sandbox settlement remains rejected in production. Top-up UI stays unavailable until a real payment provider adapter/account is ready.

## Requires action / not yet complete

- Upstash installation is at its Accept and Create screen, awaiting explicit confirmation for its own Terms/Privacy, Marketplace Addendum and account-data sharing. Not accepted or provisioned yet.
- Resend sender is onboarding@resend.dev: only the provider account owner can receive test mail until an owned sender domain is verified. No general-member delivery claim; need the user's domain/DNS access. No live email sent yet.
- Actual Google login and end-to-end registration not yet tested. Google Testing audience must include the intended test email(s). Email OTP is not independent MFA.
- No real payment provider account/credentials supplied or tested. No live PromptPay QR or payment claim. Independent Admin MFA/admin management, reconciliation, operational recovery, provider tests and backup restore remain release blockers.
- Initial database integration links Preview and Production to the same empty database. Authentication secrets are Production-only. Before preview registration is enabled, provision an isolated preview database.

## Financial tests

29 tests passed against dedicated local PostgreSQL test database. They were not run on cloud production data. Production database migrations and terminal provisioning succeeded; no synthetic financial activity was inserted there.

## Private configuration

.env.production.local is ignored by Git. Never upload it. Do not paste tokens into chats/screenshots. Rotate secrets if disclosed outside the intended operator/provider channels. CLI migrations require the database URL; application startup does not run migrations automatically.
