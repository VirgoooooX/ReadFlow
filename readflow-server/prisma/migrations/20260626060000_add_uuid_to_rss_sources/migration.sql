-- AlterTable
ALTER TABLE "rss_sources" ADD COLUMN "uuid" TEXT;

-- Update existing rows with a random UUID
UPDATE "rss_sources" SET "uuid" = gen_random_uuid()::text WHERE "uuid" IS NULL;

-- Make it NOT NULL
ALTER TABLE "rss_sources" ALTER COLUMN "uuid" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "rss_sources_uuid_key" ON "rss_sources"("uuid");
