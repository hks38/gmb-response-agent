-- CreateTable
CREATE TABLE "Practice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "radiusMiles" INTEGER NOT NULL DEFAULT 20,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "distanceMiles" REAL NOT NULL,
    "geocode" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Area_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeywordCost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "avgCpc" REAL NOT NULL,
    "minCpc" REAL NOT NULL,
    "maxCpc" REAL NOT NULL,
    "searchVolume" INTEGER NOT NULL,
    "competition" TEXT NOT NULL,
    "specialtyType" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KeywordCost_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practiceId" TEXT NOT NULL,
    "topAreas" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Analysis_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "originalSha256" TEXT NOT NULL,
    "sanitizedSha256" TEXT NOT NULL,
    "violationCodesJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("avoidRepeatLastNPosts", "businessEmail", "businessLocation", "businessName", "businessPhone", "createdAt", "dailyReviewsCron", "defaultUseSerpApiRankings", "emailTo", "gmbPostMaxWords", "id", "monthlyReportCron", "monthlyReportUseSerpApiRankings", "reviewMaxWords", "reviewMinWords", "reviewSignature", "schedulerEnabled", "schedulerTz", "twiceWeeklyPostCron", "updatedAt", "websiteUrl") SELECT "avoidRepeatLastNPosts", "businessEmail", "businessLocation", "businessName", "businessPhone", "createdAt", "dailyReviewsCron", "defaultUseSerpApiRankings", "emailTo", "gmbPostMaxWords", "id", "monthlyReportCron", "monthlyReportUseSerpApiRankings", "reviewMaxWords", "reviewMinWords", "reviewSignature", "schedulerEnabled", "schedulerTz", "twiceWeeklyPostCron", "updatedAt", "websiteUrl" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Business" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE TABLE "new_BusinessMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BusinessMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BusinessMembership" ("businessId", "createdAt", "id", "role", "updatedAt", "userId") SELECT "businessId", "createdAt", "id", "role", "updatedAt", "userId" FROM "BusinessMembership";
DROP TABLE "BusinessMembership";
ALTER TABLE "new_BusinessMembership" RENAME TO "BusinessMembership";
CREATE INDEX "BusinessMembership_businessId_idx" ON "BusinessMembership"("businessId");
CREATE INDEX "BusinessMembership_userId_idx" ON "BusinessMembership"("userId");
CREATE UNIQUE INDEX "BusinessMembership_userId_businessId_key" ON "BusinessMembership"("userId", "businessId");
CREATE TABLE "new_BusinessSettings" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BusinessSettings" ("avoidRepeatLastNPosts", "businessEmail", "businessId", "businessLocation", "businessName", "businessPhone", "createdAt", "dailyReviewsCron", "defaultUseSerpApiRankings", "emailTo", "gmbPostMaxWords", "id", "monthlyReportCron", "monthlyReportUseSerpApiRankings", "reviewMaxWords", "reviewMinWords", "reviewSignature", "schedulerEnabled", "schedulerTz", "twiceWeeklyPostCron", "updatedAt", "websiteUrl") SELECT "avoidRepeatLastNPosts", "businessEmail", "businessId", "businessLocation", "businessName", "businessPhone", "createdAt", "dailyReviewsCron", "defaultUseSerpApiRankings", "emailTo", "gmbPostMaxWords", "id", "monthlyReportCron", "monthlyReportUseSerpApiRankings", "reviewMaxWords", "reviewMinWords", "reviewSignature", "schedulerEnabled", "schedulerTz", "twiceWeeklyPostCron", "updatedAt", "websiteUrl" FROM "BusinessSettings";
DROP TABLE "BusinessSettings";
ALTER TABLE "new_BusinessSettings" RENAME TO "BusinessSettings";
CREATE UNIQUE INDEX "BusinessSettings_businessId_key" ON "BusinessSettings"("businessId");
CREATE TABLE "new_GoogleCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google_gbp',
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "expiryDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleCredential_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoogleCredential_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GoogleCredential" ("accessTokenEnc", "businessId", "createdAt", "expiryDate", "id", "locationId", "provider", "refreshTokenEnc", "updatedAt") SELECT "accessTokenEnc", "businessId", "createdAt", "expiryDate", "id", "locationId", "provider", "refreshTokenEnc", "updatedAt" FROM "GoogleCredential";
DROP TABLE "GoogleCredential";
ALTER TABLE "new_GoogleCredential" RENAME TO "GoogleCredential";
CREATE INDEX "GoogleCredential_businessId_idx" ON "GoogleCredential"("businessId");
CREATE UNIQUE INDEX "GoogleCredential_locationId_provider_key" ON "GoogleCredential"("locationId", "provider");
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KeywordTrend_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeywordTrend_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KeywordTrend" ("businessId", "category", "createdAt", "id", "keyword", "latitude", "location", "locationId", "longitude", "previousWeekScore", "radius", "searchVolume", "trendScore", "updatedAt", "weekOf") SELECT "businessId", "category", "createdAt", "id", "keyword", "latitude", "location", "locationId", "longitude", "previousWeekScore", "radius", "searchVolume", "trendScore", "updatedAt", "weekOf" FROM "KeywordTrend";
DROP TABLE "KeywordTrend";
ALTER TABLE "new_KeywordTrend" RENAME TO "KeywordTrend";
CREATE INDEX "KeywordTrend_weekOf_idx" ON "KeywordTrend"("weekOf");
CREATE INDEX "KeywordTrend_keyword_idx" ON "KeywordTrend"("keyword");
CREATE INDEX "KeywordTrend_location_idx" ON "KeywordTrend"("location");
CREATE INDEX "KeywordTrend_businessId_idx" ON "KeywordTrend"("businessId");
CREATE UNIQUE INDEX "KeywordTrend_businessId_keyword_location_weekOf_key" ON "KeywordTrend"("businessId", "keyword", "location", "weekOf");
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KeywordWeeklyReport_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeywordWeeklyReport_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KeywordWeeklyReport" ("businessId", "createdAt", "id", "latitude", "location", "locationId", "longitude", "radius", "reportDate", "summary", "topKeywords", "totalKeywords", "trendingDown", "trendingUp", "updatedAt") SELECT "businessId", "createdAt", "id", "latitude", "location", "locationId", "longitude", "radius", "reportDate", "summary", "topKeywords", "totalKeywords", "trendingDown", "trendingUp", "updatedAt" FROM "KeywordWeeklyReport";
DROP TABLE "KeywordWeeklyReport";
ALTER TABLE "new_KeywordWeeklyReport" RENAME TO "KeywordWeeklyReport";
CREATE INDEX "KeywordWeeklyReport_reportDate_idx" ON "KeywordWeeklyReport"("reportDate");
CREATE INDEX "KeywordWeeklyReport_location_idx" ON "KeywordWeeklyReport"("location");
CREATE INDEX "KeywordWeeklyReport_businessId_idx" ON "KeywordWeeklyReport"("businessId");
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "googleAccountId" TEXT,
    "googleLocationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Location" ("address", "businessId", "createdAt", "googleAccountId", "googleLocationId", "id", "name", "updatedAt") SELECT "address", "businessId", "createdAt", "googleAccountId", "googleLocationId", "id", "name", "updatedAt" FROM "Location";
DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
CREATE INDEX "Location_businessId_idx" ON "Location"("businessId");
CREATE INDEX "Location_googleAccountId_idx" ON "Location"("googleAccountId");
CREATE INDEX "Location_googleLocationId_idx" ON "Location"("googleLocationId");
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Review" ("authorName", "businessId", "comment", "createTime", "createdAt", "id", "lastAnalyzedAt", "locationId", "rating", "repliedAt", "replyDraft", "reviewId", "riskFlags", "sentiment", "status", "suggestedActions", "topics", "updateTime", "updatedAt", "urgency") SELECT "authorName", "businessId", "comment", "createTime", "createdAt", "id", "lastAnalyzedAt", "locationId", "rating", "repliedAt", "replyDraft", "reviewId", "riskFlags", "sentiment", "status", "suggestedActions", "topics", "updateTime", "updatedAt", "urgency" FROM "Review";
DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";
CREATE INDEX "Review_businessId_createTime_idx" ON "Review"("businessId", "createTime");
CREATE INDEX "Review_locationId_status_idx" ON "Review"("locationId", "status");
CREATE UNIQUE INDEX "Review_locationId_reviewId_key" ON "Review"("locationId", "reviewId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatarUrl", "createdAt", "email", "id", "name", "updatedAt") SELECT "avatarUrl", "createdAt", "email", "id", "name", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Area_practiceId_idx" ON "Area"("practiceId");

-- CreateIndex
CREATE INDEX "KeywordCost_areaId_idx" ON "KeywordCost"("areaId");

-- CreateIndex
CREATE INDEX "KeywordCost_keyword_idx" ON "KeywordCost"("keyword");

-- CreateIndex
CREATE INDEX "KeywordCost_specialtyType_idx" ON "KeywordCost"("specialtyType");

-- CreateIndex
CREATE INDEX "Analysis_practiceId_idx" ON "Analysis"("practiceId");

-- CreateIndex
CREATE INDEX "AuditEvent_businessId_createdAt_idx" ON "AuditEvent"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

