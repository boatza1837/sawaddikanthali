# Durable notification settlement

The Windows listener captures matching LINE/Krungthai Connext notifications into
the ignored local `.cache/connext-outbox.json` before network delivery. Restarting
retains pending entries. Historical, uncaptured notifications are not credited on
startup. Keep this private file: it contains payment notification text. A stale or
rejected entry remains REVIEW for investigation; it does not become a deposit.

The signed endpoint persists a `ConnextJob` before acknowledgement. A bounded worker
uses a recoverable database lease, locks the matched intent, and atomically writes
the wallet increment, balanced ledger, payment receipt, audit and completed job.
Duplicate messages and already settled intents do not credit again. Failed jobs
retry with exponential delays up to ten attempts, then remain REVIEW. Admin can
view pending/review counts and requeue reviewed jobs; this action is audited.

Workers run on listener heartbeats, accepted events and authenticated status polls.
This is not a continuously running background daemon on Vercel. If all triggers
stop, persisted jobs wait until a trigger resumes. LINE/Windows may coalesce or
lose notifications before capture; server durability cannot recover those. The
67-second Slip2Go fallback is preserved.

## Amount reservations

A whole-baht request of 100 fills 100.01 through 100.99 first (99 amounts), then
descends through 99.99, 99.98, etc. Up to 499 positive satang amounts below the
base are available after that (maximum discount 4.99 baht); the actual transferred
amount is fully credited. A 1-baht request has 198 positive possibilities, and
amounts never exceed the existing payment maximum of 10,000 baht. This is finite
capacity, not unlimited allocation.
Reservations remain held through intent expiry plus three minutes to avoid late
notification matching, then can be reused instead of being blocked for 24 hours.
The UI displays the actual payable amount before transfer.

## Local validation, 2026-11-02

No real Slip2Go/Brevo calls. Dedicated localhost PostgreSQL test databases only.
The HTTP benchmark blocks outbound fetch except 127.0.0.1 and uses fake provider
configuration. It exercises actual Prisma/payment service code, not full Next.js,
OAuth, production Redis, Vercel hosting or real LINE throughput.

- 50 simultaneous reservations: 50/50, 50 distinct amounts, p95 1,112 ms.
- 50 transfers delivered twice: 100/100 accepted; p95 188 ms.
- Additional independent 50-transfer burst delivered twice: 100/100 accepted.
- All 100 unique transfers settled in approximately 2,723 ms of worker time.
- 100 paid intents, 100 TOPUP ledgers; expected/actual 33,320,000 satang.
- Repeated delivery did not create extra credits.
- 110 concurrent reservations, expired-slot reuse, worker lease recovery and
  retry of an initially unmatched job passed integration checks.

Raw local result: `.cache/load-test-queue-report.json` (ignored). Prior baseline
results are in LOAD_TEST_REPORT.md; its old bottlenecks describe the pre-queue
version. Real LINE notification capture requires its own device test. Never send
test bot notifications into the production bank notification endpoint.

## Isolated LINE capture test

Free test OA: `Canteen Test Bot`, `@642afwey`; provider `Smart Canteen Test`.
The bot is deliberately not named Krungthai Connext. Production capture only
accepts the bank account title; test capture only accepts the test bot title.

Put `LINE_TEST_CHANNEL_ACCESS_TOKEN` and your own `LINE_TEST_USER_ID` in ignored
`.env.line-test.local`. Never commit them. The sender verifies the bot basic ID
and display name, checks remaining limited quota, then sends 50 numbered messages
only to the configured recipient; it does not broadcast. Existing unrelated OAs
are not modified. Stop if the recipient has not added this bot as a friend.

Start `scripts/line-test-capture.ps1 -RunId <run>` using Windows PowerShell (hidden
window for automated runs). Then run `pnpm exec tsx scripts/line-test-send.ts <run>`.
Capture reports `.cache/line-test-<run>.json`; sender reports
`.cache/line-send-<run>.json`. Compare accepted versus captured IDs. A successful
send does not prove a toast was visible. Keep LINE minimized with test chat closed
so Windows can emit notifications. Capture has no wallet/database/API access.

At rollout, real LINE capture remains unverified until these reports exist and
are compared. Local financial load results above do not certify the desktop
notification delivery channel.
