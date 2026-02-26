-- AlterTable
ALTER TABLE "rss_sources" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_feeds" ADD COLUMN     "customCategory" TEXT,
ADD COLUMN     "customName" TEXT;
