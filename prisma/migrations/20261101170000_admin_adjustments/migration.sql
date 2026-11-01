-- Owner requested audited Admin-only wallet adjustments.
-- Separate counter-account prevents confusing manual adjustments with bank topups or sales.
ALTER TABLE "LedgerEntry" DROP CONSTRAINT entry_account,
 ADD CONSTRAINT entry_account CHECK (account IN ('CLEARING','WALLET_LIABILITY','SALES','ADMIN_ADJUSTMENT'));
CREATE INDEX "AuditLog_action_targetId_idx" ON "AuditLog"(action,"targetId");
