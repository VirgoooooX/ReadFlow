ALTER TABLE "user_rss_groups" ADD COLUMN IF NOT EXISTS "icon" TEXT;
ALTER TABLE "user_rss_groups" ADD COLUMN IF NOT EXISTS "color" TEXT;

ALTER TABLE "user_feeds" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_feeds" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_feeds" ADD COLUMN IF NOT EXISTS "contentType" TEXT;
ALTER TABLE "user_feeds" ADD COLUMN IF NOT EXISTS "sourceMode" TEXT;
ALTER TABLE "user_feeds" ADD COLUMN IF NOT EXISTS "fetchLimit" INTEGER;
ALTER TABLE "user_feeds" ADD COLUMN IF NOT EXISTS "retentionLimit" INTEGER;
ALTER TABLE "user_feeds" ADD COLUMN IF NOT EXISTS "updateFrequency" INTEGER;

CREATE TABLE IF NOT EXISTS "user_rss_filter_rules" (
  "id" SERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "isRegex" BOOLEAN NOT NULL DEFAULT false,
  "scope" TEXT NOT NULL DEFAULT 'global',
  "sourceUrls" JSONB,
  "target" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_rss_filter_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_rss_filter_rules_userId_idx" ON "user_rss_filter_rules"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_rss_filter_rules_userId_fkey'
  ) THEN
    ALTER TABLE "user_rss_filter_rules"
      ADD CONSTRAINT "user_rss_filter_rules_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
