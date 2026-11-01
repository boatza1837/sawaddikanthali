-- CreateTable
CREATE TABLE "SlipUpload" (
    "id" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "lease" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlipUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlipUpload_imageHash_key" ON "SlipUpload"("imageHash");

-- CreateIndex
CREATE INDEX "SlipUpload_intentId_leaseUntil_idx" ON "SlipUpload"("intentId", "leaseUntil");

-- AddForeignKey
ALTER TABLE "SlipUpload" ADD CONSTRAINT "SlipUpload_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "TopupIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
