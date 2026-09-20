-- CreateTable
CREATE TABLE "ticket_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_tokens_tokenHash_key" ON "ticket_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "ticket_tokens_expiresAt_idx" ON "ticket_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "ticket_tokens" ADD CONSTRAINT "ticket_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
