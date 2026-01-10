-- CreateTable
CREATE TABLE "KeywordTrend" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KeywordWeeklyReport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Review" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Review" ("authorName", "comment", "createTime", "createdAt", "id", "lastAnalyzedAt", "rating", "replyDraft", "reviewId", "riskFlags", "sentiment", "status", "suggestedActions", "topics", "updateTime", "updatedAt", "urgency") SELECT "authorName", "comment", "createTime", "createdAt", "id", "lastAnalyzedAt", "rating", "replyDraft", "reviewId", "riskFlags", "sentiment", "status", "suggestedActions", "topics", "updateTime", "updatedAt", "urgency" FROM "Review";
DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";
CREATE UNIQUE INDEX "Review_reviewId_key" ON "Review"("reviewId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "KeywordTrend_weekOf_idx" ON "KeywordTrend"("weekOf");

-- CreateIndex
CREATE INDEX "KeywordTrend_keyword_idx" ON "KeywordTrend"("keyword");

-- CreateIndex
CREATE INDEX "KeywordTrend_location_idx" ON "KeywordTrend"("location");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordTrend_keyword_location_weekOf_key" ON "KeywordTrend"("keyword", "location", "weekOf");

-- CreateIndex
CREATE INDEX "KeywordWeeklyReport_reportDate_idx" ON "KeywordWeeklyReport"("reportDate");

-- CreateIndex
CREATE INDEX "KeywordWeeklyReport_location_idx" ON "KeywordWeeklyReport"("location");
