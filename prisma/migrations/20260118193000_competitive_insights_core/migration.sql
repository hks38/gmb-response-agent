-- Competitive insights core tables

-- CreateTable
CREATE TABLE "Competitor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "locationId" TEXT,
  "placeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "websiteUrl" TEXT,
  "phone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'discovered',
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Competitor_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Competitor_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Competitor_businessId_placeId_key" ON "Competitor"("businessId", "placeId");
CREATE INDEX "Competitor_businessId_status_idx" ON "Competitor"("businessId", "status");
CREATE INDEX "Competitor_locationId_status_idx" ON "Competitor"("locationId", "status");

CREATE TRIGGER "Competitor_updatedAt"
AFTER UPDATE ON "Competitor"
FOR EACH ROW
BEGIN
  UPDATE "Competitor" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- CreateTable
CREATE TABLE "CompetitorSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "competitorId" TEXT NOT NULL,
  "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rating" REAL,
  "userRatingsTotal" INTEGER,
  "reviewsJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitorSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitorSnapshot_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CompetitorSnapshot_businessId_competitorId_capturedAt_idx" ON "CompetitorSnapshot"("businessId", "competitorId", "capturedAt");
CREATE INDEX "CompetitorSnapshot_capturedAt_idx" ON "CompetitorSnapshot"("capturedAt");

-- CreateTable
CREATE TABLE "CompetitorTheme" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "competitorId" TEXT NOT NULL,
  "periodStart" DATETIME NOT NULL,
  "periodEnd" DATETIME NOT NULL,
  "theme" TEXT NOT NULL,
  "sentiment" TEXT,
  "count" INTEGER NOT NULL DEFAULT 0,
  "examplesJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitorTheme_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitorTheme_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CompetitorTheme_businessId_competitorId_periodStart_idx" ON "CompetitorTheme"("businessId", "competitorId", "periodStart");

-- CreateTable
CREATE TABLE "CompetitorKeywordProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "competitorId" TEXT NOT NULL,
  "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "keywordsJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitorKeywordProfile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompetitorKeywordProfile_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CompetitorKeywordProfile_businessId_competitorId_capturedAt_idx" ON "CompetitorKeywordProfile"("businessId", "competitorId", "capturedAt");


