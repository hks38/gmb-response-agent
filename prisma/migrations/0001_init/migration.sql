-- CreateTable
CREATE TABLE "Review" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Review_reviewId_key" ON "Review"("reviewId");

-- Trigger to update updatedAt
CREATE TRIGGER "Review_updatedAt"
AFTER UPDATE ON "Review"
FOR EACH ROW
BEGIN
  UPDATE "Review" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

