-- CreateTable
CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "avatarUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TRIGGER "User_updatedAt"
AFTER UPDATE ON "User"
FOR EACH ROW
BEGIN
  UPDATE "User" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- CreateTable
CREATE TABLE "Business" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER "Business_updatedAt"
AFTER UPDATE ON "Business"
FOR EACH ROW
BEGIN
  UPDATE "Business" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- CreateTable
CREATE TABLE "BusinessMembership" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'STAFF',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BusinessMembership_userId_businessId_key" ON "BusinessMembership"("userId", "businessId");
CREATE INDEX "BusinessMembership_businessId_idx" ON "BusinessMembership"("businessId");
CREATE INDEX "BusinessMembership_userId_idx" ON "BusinessMembership"("userId");

CREATE TRIGGER "BusinessMembership_updatedAt"
AFTER UPDATE ON "BusinessMembership"
FOR EACH ROW
BEGIN
  UPDATE "BusinessMembership" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- CreateTable
CREATE TABLE "Location" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "googleAccountId" TEXT,
  "googleLocationId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Location_businessId_idx" ON "Location"("businessId");
CREATE INDEX "Location_googleAccountId_idx" ON "Location"("googleAccountId");
CREATE INDEX "Location_googleLocationId_idx" ON "Location"("googleLocationId");

CREATE TRIGGER "Location_updatedAt"
AFTER UPDATE ON "Location"
FOR EACH ROW
BEGIN
  UPDATE "Location" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- CreateTable
CREATE TABLE "GoogleCredential" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'google_gbp',
  "refreshTokenEnc" TEXT NOT NULL,
  "accessTokenEnc" TEXT,
  "expiryDate" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GoogleCredential_locationId_provider_key" ON "GoogleCredential"("locationId", "provider");
CREATE INDEX "GoogleCredential_businessId_idx" ON "GoogleCredential"("businessId");

CREATE TRIGGER "GoogleCredential_updatedAt"
AFTER UPDATE ON "GoogleCredential"
FOR EACH ROW
BEGIN
  UPDATE "GoogleCredential" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- CreateTable
CREATE TABLE "BusinessSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,

  "businessName" TEXT NOT NULL DEFAULT 'Malama Dental',
  "businessLocation" TEXT NOT NULL DEFAULT 'Long Valley, NJ',
  "websiteUrl" TEXT NOT NULL DEFAULT 'https://malama.dental',
  "businessPhone" TEXT,
  "businessEmail" TEXT,

  "emailTo" TEXT NOT NULL DEFAULT 'malamadentalgroup@gmail.com',

  "schedulerEnabled" BOOLEAN NOT NULL DEFAULT true,
  "schedulerTz" TEXT NOT NULL DEFAULT 'America/New_York',
  "dailyReviewsCron" TEXT NOT NULL DEFAULT '0 19 * * *',
  "twiceWeeklyPostCron" TEXT NOT NULL DEFAULT '0 10 * * 2,5',
  "monthlyReportCron" TEXT NOT NULL DEFAULT '0 9 1 * *',
  "avoidRepeatLastNPosts" INTEGER NOT NULL DEFAULT 5,

  "reviewMinWords" INTEGER NOT NULL DEFAULT 25,
  "reviewMaxWords" INTEGER NOT NULL DEFAULT 150,
  "reviewSignature" TEXT NOT NULL DEFAULT 'Warm regards,
{businessName} Team',

  "gmbPostMaxWords" INTEGER NOT NULL DEFAULT 150,

  "defaultUseSerpApiRankings" BOOLEAN NOT NULL DEFAULT false,
  "monthlyReportUseSerpApiRankings" BOOLEAN NOT NULL DEFAULT true,

  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BusinessSettings_businessId_key" ON "BusinessSettings"("businessId");

CREATE TRIGGER "BusinessSettings_updatedAt"
AFTER UPDATE ON "BusinessSettings"
FOR EACH ROW
BEGIN
  UPDATE "BusinessSettings" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- CreateTable
CREATE TABLE "AuthMagicLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AuthMagicLink_tokenHash_key" ON "AuthMagicLink"("tokenHash");
CREATE INDEX "AuthMagicLink_email_idx" ON "AuthMagicLink"("email");
CREATE INDEX "AuthMagicLink_expiresAt_idx" ON "AuthMagicLink"("expiresAt");

-- Backfill default Business/Location/Settings from legacy AppSettings
INSERT INTO "Business" ("id", "name")
SELECT 'biz_default', COALESCE("businessName", 'Default Business')
FROM "AppSettings"
WHERE "id" = 'default';

INSERT INTO "Location" ("id", "businessId", "name")
SELECT 'loc_default', 'biz_default', COALESCE("businessName", 'Default Business') || ' Location'
FROM "AppSettings"
WHERE "id" = 'default';

INSERT INTO "BusinessSettings" (
  "id",
  "businessId",
  "businessName",
  "businessLocation",
  "websiteUrl",
  "businessPhone",
  "businessEmail",
  "emailTo",
  "schedulerEnabled",
  "schedulerTz",
  "dailyReviewsCron",
  "twiceWeeklyPostCron",
  "monthlyReportCron",
  "avoidRepeatLastNPosts",
  "reviewMinWords",
  "reviewMaxWords",
  "reviewSignature",
  "gmbPostMaxWords",
  "defaultUseSerpApiRankings",
  "monthlyReportUseSerpApiRankings"
)
SELECT
  'bizset_default',
  'biz_default',
  "businessName",
  "businessLocation",
  "websiteUrl",
  "businessPhone",
  "businessEmail",
  "emailTo",
  "schedulerEnabled",
  "schedulerTz",
  "dailyReviewsCron",
  "twiceWeeklyPostCron",
  "monthlyReportCron",
  "avoidRepeatLastNPosts",
  "reviewMinWords",
  "reviewMaxWords",
  "reviewSignature",
  "gmbPostMaxWords",
  "defaultUseSerpApiRankings",
  "monthlyReportUseSerpApiRankings"
FROM "AppSettings"
WHERE "id" = 'default';

-- Redefine Review (add businessId/locationId, change uniqueness to (locationId, reviewId))
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Review" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "businessId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createTime" DATETIME NOT NULL,
  "updateTime" DATETIME NOT NULL,
  "sentiment" TEXT,
  "urgency" TEXT,
  "topics" TEXT,
  "suggestedActions" TEXT,
  "riskFlags" TEXT,
  "replyDraft" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Needs Approval',
  "lastAnalyzedAt" DATETIME,
  "repliedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Review" (
  "id",
  "businessId",
  "locationId",
  "reviewId",
  "authorName",
  "rating",
  "comment",
  "createTime",
  "updateTime",
  "sentiment",
  "urgency",
  "topics",
  "suggestedActions",
  "riskFlags",
  "replyDraft",
  "status",
  "lastAnalyzedAt",
  "repliedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  'biz_default',
  'loc_default',
  "reviewId",
  "authorName",
  "rating",
  "comment",
  "createTime",
  "updateTime",
  "sentiment",
  "urgency",
  "topics",
  "suggestedActions",
  "riskFlags",
  "replyDraft",
  "status",
  "lastAnalyzedAt",
  "repliedAt",
  "createdAt",
  "updatedAt"
FROM "Review";

DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";

CREATE UNIQUE INDEX "Review_locationId_reviewId_key" ON "Review"("locationId", "reviewId");
CREATE INDEX "Review_businessId_createTime_idx" ON "Review"("businessId", "createTime");
CREATE INDEX "Review_locationId_status_idx" ON "Review"("locationId", "status");

CREATE TRIGGER "Review_updatedAt"
AFTER UPDATE ON "Review"
FOR EACH ROW
BEGIN
  UPDATE "Review" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- Redefine KeywordTrend (add businessId/locationId, adjust uniqueness)
CREATE TABLE "new_KeywordTrend" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "businessId" TEXT NOT NULL,
  "locationId" TEXT,
  "keyword" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "latitude" REAL,
  "longitude" REAL,
  "radius" INTEGER NOT NULL DEFAULT 10,
  "searchVolume" INTEGER,
  "trendScore" REAL,
  "weekOf" DATETIME NOT NULL,
  "previousWeekScore" REAL,
  "category" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_KeywordTrend" (
  "id",
  "businessId",
  "locationId",
  "keyword",
  "location",
  "latitude",
  "longitude",
  "radius",
  "searchVolume",
  "trendScore",
  "weekOf",
  "previousWeekScore",
  "category",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  'biz_default',
  NULL,
  "keyword",
  "location",
  "latitude",
  "longitude",
  "radius",
  "searchVolume",
  "trendScore",
  "weekOf",
  "previousWeekScore",
  "category",
  "createdAt",
  "updatedAt"
FROM "KeywordTrend";

DROP TABLE "KeywordTrend";
ALTER TABLE "new_KeywordTrend" RENAME TO "KeywordTrend";

CREATE UNIQUE INDEX "KeywordTrend_businessId_keyword_location_weekOf_key" ON "KeywordTrend"("businessId", "keyword", "location", "weekOf");
CREATE INDEX "KeywordTrend_weekOf_idx" ON "KeywordTrend"("weekOf");
CREATE INDEX "KeywordTrend_keyword_idx" ON "KeywordTrend"("keyword");
CREATE INDEX "KeywordTrend_location_idx" ON "KeywordTrend"("location");
CREATE INDEX "KeywordTrend_businessId_idx" ON "KeywordTrend"("businessId");

CREATE TRIGGER "KeywordTrend_updatedAt"
AFTER UPDATE ON "KeywordTrend"
FOR EACH ROW
BEGIN
  UPDATE "KeywordTrend" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- Redefine KeywordWeeklyReport (add businessId/locationId)
CREATE TABLE "new_KeywordWeeklyReport" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "businessId" TEXT NOT NULL,
  "locationId" TEXT,
  "reportDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "location" TEXT NOT NULL,
  "latitude" REAL,
  "longitude" REAL,
  "radius" INTEGER NOT NULL DEFAULT 10,
  "totalKeywords" INTEGER NOT NULL,
  "topKeywords" TEXT NOT NULL,
  "trendingUp" TEXT,
  "trendingDown" TEXT,
  "summary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_KeywordWeeklyReport" (
  "id",
  "businessId",
  "locationId",
  "reportDate",
  "location",
  "latitude",
  "longitude",
  "radius",
  "totalKeywords",
  "topKeywords",
  "trendingUp",
  "trendingDown",
  "summary",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  'biz_default',
  NULL,
  "reportDate",
  "location",
  "latitude",
  "longitude",
  "radius",
  "totalKeywords",
  "topKeywords",
  "trendingUp",
  "trendingDown",
  "summary",
  "createdAt",
  "updatedAt"
FROM "KeywordWeeklyReport";

DROP TABLE "KeywordWeeklyReport";
ALTER TABLE "new_KeywordWeeklyReport" RENAME TO "KeywordWeeklyReport";

CREATE INDEX "KeywordWeeklyReport_reportDate_idx" ON "KeywordWeeklyReport"("reportDate");
CREATE INDEX "KeywordWeeklyReport_location_idx" ON "KeywordWeeklyReport"("location");
CREATE INDEX "KeywordWeeklyReport_businessId_idx" ON "KeywordWeeklyReport"("businessId");

CREATE TRIGGER "KeywordWeeklyReport_updatedAt"
AFTER UPDATE ON "KeywordWeeklyReport"
FOR EACH ROW
BEGIN
  UPDATE "KeywordWeeklyReport" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


