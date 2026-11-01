-- Informational payment notices only; these do not authorize or debit money.
CREATE TABLE "MemberNotice" (
 id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE,
 "userId" TEXT NOT NULL REFERENCES "User"(id),
 "cashierId" TEXT NOT NULL REFERENCES "User"(id),
 "tokenId" TEXT NOT NULL REFERENCES "MemberToken"(id) ON DELETE CASCADE,
 amount INTEGER NOT NULL CHECK(amount>0 AND amount<=1000000),
 balance INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'INSUFFICIENT' CHECK(status IN ('INSUFFICIENT','PAID','CANCELLED')),
 "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MemberNotice_userId_expiresAt_idx" ON "MemberNotice"("userId","expiresAt");
CREATE INDEX "MemberNotice_tokenId_idx" ON "MemberNotice"("tokenId");
