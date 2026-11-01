-- Retire shift gating without deleting historical financial or staff records.
ALTER TABLE "PosTransaction" ALTER COLUMN "shiftId" DROP NOT NULL,
 ADD COLUMN "cashierId" TEXT REFERENCES "User"(id),
 ADD COLUMN "terminalId" TEXT REFERENCES "PosTerminal"(id);
UPDATE "PosTransaction" p SET "cashierId"=s."userId","terminalId"=s."terminalId"
 FROM "StaffShift" s WHERE p."shiftId"=s.id;
ALTER TABLE "PosTransaction" ADD CONSTRAINT pos_attribution_required
 CHECK ("shiftId" IS NOT NULL OR ("cashierId" IS NOT NULL AND "terminalId" IS NOT NULL));
CREATE INDEX "PosTransaction_cashierId_idx" ON "PosTransaction"("cashierId");
CREATE FUNCTION protect_pos_attribution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW."cashierId",NEW."terminalId") IS DISTINCT FROM (OLD."cashierId",OLD."terminalId")
 THEN RAISE EXCEPTION 'POS cashier and terminal attribution are immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER pos_attribution_immutable BEFORE UPDATE ON "PosTransaction"
 FOR EACH ROW EXECUTE FUNCTION protect_pos_attribution();
