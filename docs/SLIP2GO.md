# Slip2Go REST topups

Status: adapter implemented; live use requires merchant configuration and real provider testing. No provider calls are made by automated tests.

1. Register at https://app.slip2go.com using the merchant's phone. Choose API Connect / REST API and the trial plan. No LINE OA or Beam account is required for this website flow.
2. Copy the Secret Key from Authentication/API settings into server-only Vercel environment variable `SLIP2GO_SECRET_KEY`. Never paste it into chat, commit it or use NEXT_PUBLIC_. Confirm the API origin shown in your account is `https://connect.slip2go.com` before activating; if it differs, update the adapter using the official account documentation first.
3. Set `TOPUP_BANK_CODE` (three-digit Thai bank code, e.g. SCB 014), `TOPUP_BANK_ACCOUNT` (full digits without separators), `TOPUP_ACCOUNT_NAME` (exact recipient name returned by bank), and `TOPUP_PROMPTPAY` (Thai mobile number linked to that account). This first implementation supports mobile-number PromptPay only. National-ID/business proxies require a separate implementation; do not substitute them.
4. Set `PAYMENT_MODE=slip2go`, apply migrations, generate Prisma, redeploy. Missing/invalid configuration keeps the payment UI disabled. For local online development the launcher preserves slip2go mode when explicitly configured.
5. Check account IP restrictions before live calls. Vercel outbound addresses can change. The guide describes IP whitelist as optional; confirm account behavior rather than repeatedly adding temporary IPs.
6. Run one deliberate small real transfer, verify name/receiver formats and successful response code with provider; reconcile actual bank receipt and wallet ledger. Do not claim live readiness until this succeeds. Automated tests mock fetch and use only canteen_test, consuming no provider quota. Never load-test the free plan.

Flow: authenticated member creates an intent, pays its QR and uploads JPEG/PNG <=3MB. Transfer must occur after intent creation and before its 30-minute expiry. Expired/ambiguous transfers go to staff for reconciliation, never automatic second transfer. Same-device session storage offers intent recovery after reload; another device requires staff assistance. Keep the source slip private; possession of a slip is not proof of payer identity.

Trust boundary: server-only Bearer authentication, fixed HTTPS provider origin, no redirects or uploaded URLs; only `200200` accepted after sending receiver/amount/date conditions. Independently validate amount, timestamp, bank/account mask positions (>=4 visible digits), and exact normalized account name. Unexpected masks/names/codes fail closed and need reconciliation, not looser matching. Provider names may include titles; configure the name actually returned by the bank.

Deduplication: globally unique bank+transaction reference via TopupIntent.paymentRef plus immutable PaymentWebhook; image SHA256 is bound to an intent and persisted to prevent duplicate calls across retries. One-minute leases stop concurrent uploads. Provider duplicate marking is disabled deliberately: the database guarantees single settlement without stranding paid users when the first network response was lost. Never treat a provider duplicate/error code as success. No automatic provider retry or API polling. Limits: 5 provider attempts/member/hour and 50/day globally, stored in Redis. This intentionally protects the 100-slip trial; adjust only with an explicit budget decision. Invalid/duplicate submissions may still cost provider credits.

Settlement posts wallet increment, balanced TOPUP ledger (CLEARING -> WALLET_LIABILITY), audit event, bank reference and PAID intent atomically in PostgreSQL SERIALIZABLE transactions. No image or full provider response is retained; only hash, transfer reference, time and audit amount. Existing sandbox endpoints remain disabled in production.

Official references:
- https://slip2go.com/guide/rest-api/image
- https://slip2go.com/guide/authentication
- https://slip2go.com/guide/response
- https://slip2go.com/pricing
