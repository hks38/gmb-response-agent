-- CreateTable
CREATE TABLE "ReviewReplyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "diffBaseVersionId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewReplyVersion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewReplyVersion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewReplyVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
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
    "assignedToUserId" TEXT,
    "assignedAt" DATETIME,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "needsApprovalSince" DATETIME,
    "lastReminderAt" DATETIME,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Review_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Review" ("authorName", "businessId", "comment", "createTime", "createdAt", "id", "lastAnalyzedAt", "locationId", "rating", "repliedAt", "replyDraft", "reviewId", "riskFlags", "sentiment", "status", "suggestedActions", "topics", "updateTime", "updatedAt", "urgency") SELECT "authorName", "businessId", "comment", "createTime", "createdAt", "id", "lastAnalyzedAt", "locationId", "rating", "repliedAt", "replyDraft", "reviewId", "riskFlags", "sentiment", "status", "suggestedActions", "topics", "updateTime", "updatedAt", "urgency" FROM "Review";
DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";
CREATE INDEX "Review_businessId_createTime_idx" ON "Review"("businessId", "createTime");
CREATE INDEX "Review_locationId_status_idx" ON "Review"("locationId", "status");
CREATE INDEX "Review_businessId_status_idx" ON "Review"("businessId", "status");
CREATE INDEX "Review_assignedToUserId_status_idx" ON "Review"("assignedToUserId", "status");
CREATE UNIQUE INDEX "Review_locationId_reviewId_key" ON "Review"("locationId", "reviewId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ReviewReplyVersion_businessId_createdAt_idx" ON "ReviewReplyVersion"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewReplyVersion_reviewId_createdAt_idx" ON "ReviewReplyVersion"("reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewReplyVersion_createdByUserId_createdAt_idx" ON "ReviewReplyVersion"("createdByUserId", "createdAt");


