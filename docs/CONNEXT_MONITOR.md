# Receiver outage monitoring

The existing LINE OA sends receiver outage/recovery alerts only to the configured
owner user ID. Set MONITOR_LINE_TOKEN and MONITOR_LINE_USER_ID as server secrets.
No customer/financial data is included in these alerts. LINE monthly quota still
applies. Alerts are persisted, retried with the same LINE retry key and marked
REVIEW after ten unsuccessful attempts. Repeated identical health reports do not
send repeated outage messages.

The desktop agent sends signed version-2 health reports every 15 seconds:
ONLINE (LINE process exists and notification permission is allowed), LINE_STOPPED,
NOTIFICATIONS_DENIED or UNKNOWN. Old agents cannot mark availability online.
Availability fails closed after 45 seconds, or immediately for an unhealthy report;
new Connext intent creation is blocked server-side. The wallet polls every five
seconds and offers Slip2Go instead. Existing transfer intents remain usable with
the 67-second slip fallback; customers must never transfer again to replace a
pending payment. A slip flow stays mounted if the receiver recovers mid-payment.

**LINE login-screen inspection was deferred by the owner. ONLINE does not prove
that LINE is authenticated.** An open but logged-out LINE process is not detected
by this version. No application UI or chat content is inspected. Re-enable login
state detection only when the owner authorizes the read-only app check.

GitHub Actions calls /api/connext-health externally about every five minutes, so a
desktop power/network/agent outage can notify the owner without that desktop.
The endpoint derives state only from stored signed heartbeats, accepts no caller
state/message/recipient, and throttles checks to one per 30 seconds. After 60
seconds without a heartbeat, health transitions OFFLINE. Only status changes enqueue
alerts. Successful heartbeat recovery enqueues the recovery message. Queued alerts
can resume from heartbeats or the external watchdog.

GitHub schedules may be delayed and public-repository schedules disable after
60 days with no repository activity. This is a free best-effort watchdog, not a
one-minute or five-minute delivery guarantee. Check Actions periodically. It cannot
notify through LINE if LINE's API is unavailable, the owner blocks the bot or its
quota is exhausted; those failures remain in the alert queue for investigation.

Validation: isolated PostgreSQL tests cover transition deduplication, receiver
timeout without desktop calls, recovery, failed-send retry with stable retry key,
legacy/stale availability rejection. LINE sends are mocked in automated tests;
live rollout checks should only send owner health notifications, never Slip2Go
checks or email.
