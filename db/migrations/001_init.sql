-- PerfilPro: schema inicial (sem Prisma)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "ProfileStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BlockType" AS ENUM (
    'HERO', 'CTA_BUTTON', 'LINK_BUTTON', 'WHATSAPP',
    'SOCIAL', 'SERVICES', 'TESTIMONIALS', 'LOCATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

CREATE TABLE IF NOT EXISTS "profiles" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "username" TEXT UNIQUE,
  "displayName" TEXT,
  "headline" TEXT,
  "bio" TEXT,
  "avatarUrl" TEXT,
  "location" TEXT,
  "theme" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" "ProfileStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMPTZ,
  "usernameChangesAfterPublish" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "blocks" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "profileId" TEXT NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "type" "BlockType" NOT NULL,
  "title" TEXT,
  "content" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "blocks_profileId_sortOrder_idx" ON "blocks"("profileId", "sortOrder");

CREATE TABLE IF NOT EXISTS "service_items" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "profileId" TEXT NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceCents" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "service_items_profileId_sortOrder_idx" ON "service_items"("profileId", "sortOrder");

CREATE TABLE IF NOT EXISTS "testimonials" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "profileId" TEXT NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "authorName" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "rating" INTEGER NOT NULL DEFAULT 5,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "testimonials_profileId_sortOrder_idx" ON "testimonials"("profileId", "sortOrder");
