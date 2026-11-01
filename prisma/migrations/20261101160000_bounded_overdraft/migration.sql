-- Owner explicitly approved a maximum THB 50 outstanding debt per member.
ALTER TABLE "PosTransaction"
 ADD COLUMN "balanceBefore" INTEGER,
 ADD COLUMN "balanceAfter" INTEGER,
 ADD COLUMN "borrowed" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "overdraftApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PosTransaction" ADD CONSTRAINT pos_borrowed_valid CHECK (
 borrowed >= 0 AND borrowed <= amount AND
 (("balanceBefore" IS NULL AND "balanceAfter" IS NULL AND borrowed = 0 AND NOT "overdraftApproved")
 OR ("balanceBefore" IS NOT NULL AND "balanceAfter" IS NOT NULL
 AND "balanceAfter"::bigint = "balanceBefore"::bigint - amount::bigint
 AND borrowed::bigint = greatest(0::bigint,-"balanceAfter"::bigint) - greatest(0::bigint,-"balanceBefore"::bigint)
 AND ("balanceAfter" >= 0 OR "overdraftApproved")))
);
CREATE FUNCTION protect_pos_financial_fields() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."balanceBefore" IS NULL OR NEW."balanceAfter" IS NULL THEN RAISE EXCEPTION 'POS balance snapshots required'; END IF;
 ELSIF (NEW."ledgerId",NEW."shiftId",NEW.amount,NEW."memberId",NEW."balanceBefore",NEW."balanceAfter",NEW.borrowed,NEW."overdraftApproved")
     IS DISTINCT FROM
     (OLD."ledgerId",OLD."shiftId",OLD.amount,OLD."memberId",OLD."balanceBefore",OLD."balanceAfter",OLD.borrowed,OLD."overdraftApproved")
 THEN RAISE EXCEPTION 'POS financial fields are immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER pos_financial_fields BEFORE INSERT OR UPDATE ON "PosTransaction" FOR EACH ROW EXECUTE FUNCTION protect_pos_financial_fields();
-- Replace zero floor with the explicit owner-approved hard floor; never unlimited.
ALTER TABLE "Wallet" DROP CONSTRAINT balance_nonnegative,
 ADD CONSTRAINT balance_credit_limit CHECK (balance >= -5000);
CREATE FUNCTION assert_explicit_overdraft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.balance < 0 THEN RAISE EXCEPTION 'Cannot create wallet with debt'; END IF;
 ELSIF NEW.balance < 0 AND NEW.balance < OLD.balance THEN
  IF NOT EXISTS (
   SELECT 1 FROM "PosTransaction" p
   JOIN "LedgerTransaction" l ON l.id=p."ledgerId"
   JOIN "LedgerEntry" e ON e."transactionId"=l.id
   WHERE l.kind='PURCHASE' AND l.xmin::text=pg_current_xact_id()::text
   AND p."overdraftApproved" AND p."balanceBefore"=OLD.balance AND p."balanceAfter"=NEW.balance
   AND e."walletId"=NEW.id AND e.side='DEBIT' AND e.amount=p.amount
  ) THEN RAISE EXCEPTION 'Negative debit requires explicit POS approval'; END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER wallet_explicit_overdraft AFTER INSERT OR UPDATE ON "Wallet" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_explicit_overdraft();
CREATE INDEX "LedgerTransaction_createdAt_idx" ON "LedgerTransaction"("createdAt");
