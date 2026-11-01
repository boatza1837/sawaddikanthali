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

## Update — Brevo and Upstash connected

- User approved Upstash Terms/Privacy, Marketplace Addendum and sharing Vercel ID/email/usage data with Upstash. smart-canteen-redis Free in Singapore is provisioned and connected. Actual PostgreSQL connectivity and Redis rate-limit rejection check passed. The application supports both UPSTASH_REDIS_REST_* names and Vercel-generated KV_REST_API_* names.
- User approved switching email to the existing Brevo account with a new key. Created Smart Canteen OTP as Restricted with only Transactional email permission. Existing MatchSpace key, sender settings and D:\Gehue files were not changed. Restricted key expires Nov 1, 2027 or after 90 days unused per Brevo UI.
- Existing verified Gmail sender is used, without requiring a new custom domain for this provider configuration. Brevo may rewrite free-mail sender domains; see its published sender-compliance policy. Domain authentication is still preferable for deliverability.
- EMAIL_PROVIDER=brevo, BREVO_API_KEY and BREVO_SENDER_EMAIL were saved as Production Secrets on Vercel. Resend stays an optional adapter, not the active email route. A separate Sending-access Resend key was created; the user's existing keys were preserved.
- Brevo initially rejected the test from this workstation as an unauthorized IP. With explicit user approval, only that detected IP was authorized. Global API IP blocking remains enabled. A real connection-check email to the owner's account was then accepted by Brevo. Inbox delivery has not yet been independently confirmed; the events API currently returns no matching events. Vercel outbound IP authorization still needs testing and may require updates if IPs change.
- 33 automated tests in five files passed against the dedicated local test database; build passed. Provider tests do not insert synthetic financial records in production.
- Earlier pending Upstash/domain notes above describe the initial stage and are superseded by this update for Brevo/Redis. No new terms were accepted on Brevo: existing account sign-in and a restricted API key were used. No paid plans or bank/payment accounts were opened.
