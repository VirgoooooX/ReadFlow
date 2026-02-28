-- CreateTable
CREATE TABLE IF NOT EXISTS "user_rss_groups" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_rss_groups_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_rss_groups_userId_fkey'
  ) THEN
    ALTER TABLE "user_rss_groups"
    ADD CONSTRAINT "user_rss_groups_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_rss_groups_userId_name_key'
  ) THEN
    ALTER TABLE "user_rss_groups"
    ADD CONSTRAINT "user_rss_groups_userId_name_key" UNIQUE ("userId", "name");
  END IF;
END $$;

-- AlterTable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_feeds' AND column_name = 'groupId'
  ) THEN
    ALTER TABLE "user_feeds" ADD COLUMN "groupId" INTEGER;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_feeds_groupId_fkey'
  ) THEN
    ALTER TABLE "user_feeds"
    ADD CONSTRAINT "user_feeds_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "user_rss_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
