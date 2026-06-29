CREATE INDEX "articles_sourceId_id_idx" ON "articles"("sourceId", "id");
CREATE INDEX "articles_sourceId_publishedAt_idx" ON "articles"("sourceId", "publishedAt");
CREATE INDEX "user_feeds_userId_sortOrder_idx" ON "user_feeds"("userId", "sortOrder");
CREATE INDEX "user_feeds_userId_updatedAt_idx" ON "user_feeds"("userId", "updatedAt");
CREATE INDEX "vocabulary_updatedAt_idx" ON "vocabulary"("updatedAt");
