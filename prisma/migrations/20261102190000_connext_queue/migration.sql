CREATE TABLE "ConnextReservation" ("amount" INTEGER PRIMARY KEY,"intentId" TEXT NOT NULL UNIQUE,"holdUntil" TIMESTAMP(3) NOT NULL);
ALTER TABLE "TopupIntent" ADD COLUMN "requestedAmount" INTEGER;
CREATE INDEX "ConnextReservation_holdUntil_idx" ON "ConnextReservation"("holdUntil");
CREATE TABLE "ConnextJob" ("id" TEXT PRIMARY KEY,"amount" INTEGER NOT NULL,"account" TEXT NOT NULL,"paidAt" TIMESTAMP(3) NOT NULL,"receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"status" TEXT NOT NULL DEFAULT 'PENDING',"attempts" INTEGER NOT NULL DEFAULT 0,"availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastError" TEXT);
CREATE INDEX "ConnextJob_status_availableAt_idx" ON "ConnextJob"("status","availableAt");
CREATE TABLE "ConnextWorker" ("id" TEXT PRIMARY KEY,"lease" TEXT NOT NULL,"lockedUntil" TIMESTAMP(3) NOT NULL);
ALTER TABLE "ConnextJob" ADD CONSTRAINT connext_job_state CHECK(status IN ('PENDING','DONE','REVIEW'));
ALTER TABLE "ConnextJob" ADD CONSTRAINT connext_job_amount CHECK(amount>0 AND amount<=1000000 AND attempts>=0);
-- Preserve active/settled legacy amount exclusions during rolling deployment.
INSERT INTO "ConnextReservation"("amount","intentId","holdUntil")
SELECT DISTINCT ON (amount) amount,id,"expiresAt"+interval '3 minutes' FROM "TopupIntent" WHERE provider='connext' AND "expiresAt"+interval '3 minutes'>CURRENT_TIMESTAMP ORDER BY amount,"expiresAt" DESC;
