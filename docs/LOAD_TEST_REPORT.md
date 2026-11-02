# Local load test — 2 November 2026

## Scope

Windows host: 16 logical processors, approximately 15.2 GiB RAM. PostgreSQL 17 in Docker; dedicated localhost/canteen_loadtest with all migrations. No production database changes. Synthetic users/transactions remain in this isolated database. Docker recovered after a program restart without factory reset or deletion of volumes.

This local HTTP harness calls actual Prisma wallet queries and Connext services. It excludes Next.js rendering, authentication, real Redis, bank/provider latency and actual LINE/Windows delivery. Wallets have no history during the read phase. All non-loopback fetch calls are blocked; provider credentials are empty/fake. No real SMS, emails, LINE messages, transfers or provider checks were sent.

## Wallet read results

One outstanding request per client, continuous requests without think time; eight-second launch window plus drain. Client/server run on the same machine.

| Concurrent clients | Requests | Successful | Failed | Requests/sec | p50 | p95 | p99 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 100 | 5,736 | 5,736 | 0 | 711.4 | 136 ms | 168 ms | 256 ms |
| 250 | 6,573 | 6,573 | 0 | 808.2 | 304 ms | 344 ms | 383 ms |
| 500 | 6,522 | 6,503 | 19 | 787.1 | 609 ms | 752 ms | 981 ms |

500-client failures (0.29%) were `TypeError: fetch failed`; underlying socket causes were not recorded. Do not attribute these to PostgreSQL without more instrumentation. Throughput plateaued near 800 requests/sec while latency increased, showing saturation/queuing in the combined local path. One PostgreSQL snapshot: 60.33% CPU and 73 MiB memory. Benchmark process maximum RSS approximately 463 MiB; not whole-machine peaks.

100–250 concurrent wallet-read requests passed this short scenario; 500 was not clean. This does not certify production end-user capacity, authenticated full-page requests or long-duration stability.

## Fifty concurrent topups

Finance-only diagnostic reproduced the baseline with explicit error codes:

| Stage | Successful calls | Failed calls | p95 | Notes |
|---|---:|---:|---:|---|
| 50 users create intents for the same base amount | 18/50 | 32/50 | 1,836 ms | P2034 transaction conflicts |
| 18 transfers delivered twice concurrently | 22/36 | 14/36 | 871 ms | Successful calls include duplicate acknowledgements |
| 50 independently seeded pending transfers, twice each | 58/100 | 42/100 | 2,519 ms | P2034; not 58 unique payments |
| Sequential redelivery of those 50 events | 50/50 | 0/50 | 26 ms | Includes duplicate acknowledgements |

After redelivery all 68 unique transfers (18 plus 50) had exactly 68 TOPUP ledger records. Expected and actual total balance both 25,500,683 satang. No extra credits observed. Redelivery is an explicit simulated recovery step, not proof that production automatically recovers every failure.

Safety held, but **50 concurrent intent creations are not reliable today**. Global advisory locking plus SERIALIZABLE transactions contend; the shared finance wrapper retries three times. No production finance policy was changed.

## Additional limits

- Same base amount has only 99 fractional slots reserved for 24 hours, including paid/expired intents: base 100 supports only 100.01–100.99 in that period. A separate capacity limit regardless of server speed.
- Real agent sends sequentially. Network latency, toast replacement/grouping, sleep/restart and dropped notifications were not measured. Fifty transfers may not yield fifty independently readable toasts.
- Slip2Go fallback was not load-tested against the real provider; no credits consumed.
- A normal LINE bot does not authenticate bank transfers or reproduce the bank official account source. Simulate events against an isolated sink first, then conduct a small real-device capture test.

## Next work

1. Durable notification queue, bounded workers, delayed/jittered retry and dead-letter reconciliation.
2. Scoped reservations/uniqueness instead of global contention, preserving atomic ledger settlement; benchmark again before rollout.
3. Resolve the 99-slot daily cap or use provider payment references for larger-scale use.
4. Authenticated Next.js/staging tests, realistic histories and longer soak tests; instrument connection-pool waits and socket errors.
5. Controlled real LINE capture/restart test and bank-statement reconciliation; keep fallback.

## Reproduce

Set DATABASE_URL using local test credentials from your private configuration, host localhost, database canteen_loadtest. Apply migrations. Set RUN_LOAD_TESTS=1; run `pnpm exec vitest run tests/local-load.integration.ts`. LOAD_WALLET_STAGES=0 runs finance-only diagnostics. Guard refuses a different host/database. Ordinary tests skip the benchmark.

Artifacts: `.cache/load-test-report.json` and `.cache/load-test-finance-report.json`. No deployment performed.
