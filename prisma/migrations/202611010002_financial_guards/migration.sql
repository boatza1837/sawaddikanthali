-- PostgreSQL constraints are part of the financial trust boundary.
ALTER TABLE "User" ADD CONSTRAINT user_role CHECK (role IN ('USER','EMPLOYEE','SUPERVISOR','ADMIN'));
ALTER TABLE "User" ADD CONSTRAINT user_status CHECK (status IN ('PENDING','ACTIVE','SUSPENDED'));
ALTER TABLE "Wallet" ADD CONSTRAINT balance_nonnegative CHECK (balance >= 0);
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT ledger_kind CHECK (kind IN ('TOPUP','PURCHASE','REFUND','ADJUSTMENT'));
ALTER TABLE "LedgerEntry" ADD CONSTRAINT entry_positive CHECK (amount > 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT entry_side CHECK (side IN ('DEBIT','CREDIT'));
ALTER TABLE "LedgerEntry" ADD CONSTRAINT entry_account CHECK (account IN ('CLEARING','WALLET_LIABILITY','SALES'));
ALTER TABLE "LedgerEntry" ADD CONSTRAINT liability_member CHECK ((account = 'WALLET_LIABILITY') = ("walletId" IS NOT NULL));
ALTER TABLE "TopupIntent" ADD CONSTRAINT topup_amount CHECK (amount > 0 AND amount <= 1000000 AND currency = 'THB');
ALTER TABLE "TopupIntent" ADD CONSTRAINT topup_state CHECK (status IN ('PENDING','PAID','FAILED','EXPIRED'));
ALTER TABLE "PosTransaction" ADD CONSTRAINT pos_amount CHECK (amount > 0 AND amount <= 1000000 AND refunded >= 0 AND refunded <= amount);
CREATE UNIQUE INDEX one_open_shift_per_terminal ON "StaffShift" ("terminalId") WHERE "closedAt" IS NULL;
CREATE UNIQUE INDEX one_open_shift_per_staff ON "StaffShift" ("userId") WHERE "closedAt" IS NULL;

CREATE FUNCTION reject_financial_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted financial records are immutable'; END;
$$;
CREATE TRIGGER ledger_header_immutable BEFORE UPDATE OR DELETE ON "LedgerTransaction" FOR EACH ROW EXECUTE FUNCTION reject_financial_mutation();
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION reject_financial_mutation();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_financial_mutation();
CREATE TRIGGER webhook_immutable BEFORE UPDATE OR DELETE ON "PaymentWebhook" FOR EACH ROW EXECUTE FUNCTION reject_financial_mutation();

CREATE FUNCTION prevent_late_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "LedgerTransaction" WHERE id=NEW."transactionId" AND xmin::text=pg_current_xact_id()::text) THEN
  RAISE EXCEPTION 'Cannot append to a previously posted ledger';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_no_late_entry BEFORE INSERT ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION prevent_late_entry();

CREATE FUNCTION assert_balanced_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE txn text; n bigint; dr bigint; cr bigint; wallets bigint;
BEGIN
 IF TG_TABLE_NAME='LedgerTransaction' THEN txn=NEW.id; ELSE txn=NEW."transactionId"; END IF;
 SELECT count(*),coalesce(sum(amount) FILTER(WHERE side='DEBIT'),0),coalesce(sum(amount) FILTER(WHERE side='CREDIT'),0),count("walletId")
 INTO n,dr,cr,wallets FROM "LedgerEntry" WHERE "transactionId"=txn;
 IF n<>2 OR dr<>cr OR dr<=0 OR wallets<>1 THEN RAISE EXCEPTION 'Unbalanced or invalid ledger transaction'; END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_balanced_header AFTER INSERT ON "LedgerTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_ledger();
CREATE CONSTRAINT TRIGGER ledger_balanced_entries AFTER INSERT ON "LedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_balanced_ledger();

CREATE FUNCTION assert_wallet_reconciled() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid text; summary bigint; postings bigint;
BEGIN
 IF TG_TABLE_NAME='Wallet' THEN wid=NEW.id; ELSE wid=NEW."walletId"; END IF;
 IF wid IS NULL THEN RETURN NULL; END IF;
 SELECT balance INTO summary FROM "Wallet" WHERE id=wid;
 SELECT coalesce(sum(CASE WHEN side='CREDIT' THEN amount ELSE -amount END),0) INTO postings FROM "LedgerEntry" WHERE "walletId"=wid;
 IF summary IS DISTINCT FROM postings THEN RAISE EXCEPTION 'Wallet summary does not reconcile with liability ledger'; END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER wallet_summary_reconciled AFTER INSERT OR UPDATE ON "Wallet" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_wallet_reconciled();
CREATE CONSTRAINT TRIGGER wallet_entries_reconciled AFTER INSERT ON "LedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_wallet_reconciled();
