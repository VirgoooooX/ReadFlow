DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_preferences'
  ) THEN
    CREATE TABLE "user_preferences" (
      "userId" TEXT NOT NULL,
      "settings" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("userId")
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_userId_fkey'
  ) THEN
    ALTER TABLE "user_preferences"
      ADD CONSTRAINT "user_preferences_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("uuid")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

