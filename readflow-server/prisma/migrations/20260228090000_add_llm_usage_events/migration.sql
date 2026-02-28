DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'llm_usage_events'
  ) THEN
    CREATE TABLE "llm_usage_events" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "requestId" TEXT,
      "feature" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "provider" TEXT,
      "model" TEXT,
      "profileId" TEXT,
      "cacheKey" TEXT,
      "cacheHit" BOOLEAN NOT NULL DEFAULT false,
      "durationMs" INTEGER NOT NULL,
      "tokensTotal" INTEGER,
      "tokensPrompt" INTEGER,
      "tokensCompletion" INTEGER,
      "httpStatus" INTEGER,
      "errorType" TEXT,
      "errorMessage" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "llm_usage_events_pkey" PRIMARY KEY ("id")
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'llm_usage_events_userId_fkey'
  ) THEN
    ALTER TABLE "llm_usage_events"
      ADD CONSTRAINT "llm_usage_events_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("uuid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "llm_usage_events_userId_createdAt_idx" ON "llm_usage_events" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "llm_usage_events_feature_createdAt_idx" ON "llm_usage_events" ("feature", "createdAt");
CREATE INDEX IF NOT EXISTS "llm_usage_events_status_createdAt_idx" ON "llm_usage_events" ("status", "createdAt");
