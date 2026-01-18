-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,

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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed singleton row
INSERT INTO "AppSettings" ("id") VALUES ('default');

-- Trigger to update updatedAt
CREATE TRIGGER "AppSettings_updatedAt"
AFTER UPDATE ON "AppSettings"
FOR EACH ROW
BEGIN
  UPDATE "AppSettings" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;



