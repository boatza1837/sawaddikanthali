# API contract (foundation)

All responses are JSON. Money is integer satang, THB. Session mutations require exact APP_ORIGIN Origin header, authenticated database session, active account and shared Redis rate limit. Registration permits PENDING accounts. Errors use {error: CODE}; no secrets or stack traces returned. Never cache responses containing personal/financial data.

| Method   | Path                       | Permission / body                                    |
| -------- | -------------------------- | ---------------------------------------------------- |
| GET/POST | /api/auth/*                | Auth.js Google and signout CSRF flow                 |
| POST     | /api/registration/send     | Google session, {}                                   |
| POST     | /api/registration/verify   | {code: six-digit string}                             |
| POST     | /api/registration/complete | {phone: E.164 string}                                |
| GET      | /api/wallet                | Own balance and latest 30 liability entries          |
| POST     | /api/member-token          | Own account; {} -> token, expiresAt                  |
| POST     | /api/topups                | {amount: int 1..1000000,key: UUID} -> sandbox intent |
| GET      | /api/topups/:id            | Own intent; derives EXPIRED status from expiry       |
| POST     | /api/webhooks/sandbox      | Raw signed JSON; x-sandbox-signature hex HMAC SHA256 |
| POST     | /api/pos/shift             | Staff; {terminalId,action: open or close}            |
| POST     | /api/pos/identify          | Staff; {token} -> name, memberId, balance preview    |
| POST     | /api/pos/charge            | Staff; {token,amount,key: UUID,shiftId}              |
| POST     | /api/pos/refund            | Supervisor; {purchaseId,amount,key: UUID,reason}     |
| POST     | /api/pos/lock              | Own open shift; {shiftId}; closes session's shift    |
| GET      | /api/pos/history           | Staff; own latest 30 transactions                    |
| GET      | /api/admin/overview        | Disabled pending independent MFA                     |

Charge reply includes transactionId. Idempotent replay returns the original transactionId and replayed=true; do not assume a second charge. A key used with changed amount, shift, token or actor conflicts. Token is consumed only during successful charge. Insufficient balance does not consume it. Refund approval is the supervisor call itself; no employee proposal workflow exists yet. Terminal lock closes the current shift and resets the POS, it is not an independent terminal-device authentication lock.

Webhook sandbox event: {eventId,reference: intentId,paymentRef,amount,currency: THB,status: PAID}. Event ID plus digest deduplication and unique payment reference prevent credit twice. Signed amount/reference/currency must match; expired payments are rejected for operator investigation. Production must add signed provider timestamps/replay window, provider-specific verification, stored failed events, bounded ingress sizes/rate limits and settlement reconciliation. No unknown-card API pretends RFID is functional.
