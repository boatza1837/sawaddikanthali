CREATE TABLE "AdminMfa" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
 "secret" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
 "lastCounter" BIGINT NOT NULL DEFAULT -1, "pendingSession" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AdminGrant" (
 "digest" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "sessionHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AdminGrant_userId_sessionHash_idx" ON "AdminGrant"("userId","sessionHash");
