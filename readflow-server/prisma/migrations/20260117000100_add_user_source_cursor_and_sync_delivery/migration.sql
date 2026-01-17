-- CreateTable
CREATE TABLE "user_source_cursors" (
    "userId" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "lastAckedArticleId" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_source_cursors_pkey" PRIMARY KEY ("userId","sourceId")
);

-- CreateTable
CREATE TABLE "sync_deliveries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "fromExclusiveId" INTEGER NOT NULL,
    "toInclusiveId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ackedAt" TIMESTAMP(3),
    CONSTRAINT "sync_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_deliveries_userId_sourceId_ackedAt_idx" ON "sync_deliveries"("userId", "sourceId", "ackedAt");

-- AddForeignKey
ALTER TABLE "user_source_cursors" ADD CONSTRAINT "user_source_cursors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_source_cursors" ADD CONSTRAINT "user_source_cursors_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "rss_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_deliveries" ADD CONSTRAINT "sync_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_deliveries" ADD CONSTRAINT "sync_deliveries_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "rss_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

