# Experimental Windows Connext bridge

Slip2Go remains available. Admin with current MFA can switch provider at /admin. Settings are append-only audited; changes affect new intents. Existing intents stay bound to their provider.

Connext reads Windows toast text, not a bank API. Windows must be unlocked/running, LINE logged in, notifications set to Windows and content enabled. This is experimental and notification sender labels are not bank authentication. Do not use for public real-money service without replacing the bridge with authenticated bank/provider confirmation.

Agent: scripts/connext-agent.ps1, CONNEXT_AGENT_SECRET in private .env.production.local and matching Vercel Production secret. Fixed HTTPS endpoint and HMAC SHA256, 60-second request freshness. Do not expose secret to browser. Start through Windows PowerShell; permission is already granted on this machine. No autostart is installed. Closing/restarting the PC stops collection; historical messages are intentionally skipped at startup. Unmatched/expired events require staff reconciliation; never ask customers to transfer twice.

Heartbeat 15 seconds, server TTL 45 seconds; new QR creation refuses offline agent. Amount = rounded-up requested whole baht plus a unique 0.01–0.99, credited in full. Reservations never reuse the payable amount for 24 hours, including settled/expired. Maximum two pending intents/member. Connext payment window 15 minutes. Only exact incoming message syntax, configured account suffix, recent bank timestamp, single pending amount match is accepted. All other cases reject. No OCR or AI.

Deduplication uses amount+bank-minute+account+available-balance digest; persistent unique bank reference and immutable webhook, wallet and balanced ledger committed together under SERIALIZABLE and global transaction lock. Unknown events receive no credit. Notification text is not kept in server logs. At start historical messages ignored. Agent retries network failure in memory while it runs; restart loses undelivered messages, requiring reconciliation.
