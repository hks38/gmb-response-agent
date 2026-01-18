-- Reply quality controls: templates, voice profiles, variants, signature variations

-- CreateTable
CREATE TABLE "ReplyVoiceProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "tone" TEXT NOT NULL DEFAULT 'warm, friendly, professional',
  "style" TEXT NOT NULL DEFAULT 'concise and professional',
  "doListJson" TEXT,
  "dontListJson" TEXT,
  "examplePhrasesJson" TEXT,
  "bannedPhrasesJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReplyVoiceProfile_businessId_idx" ON "ReplyVoiceProfile"("businessId");

CREATE TRIGGER "ReplyVoiceProfile_updatedAt"
AFTER UPDATE ON "ReplyVoiceProfile"
FOR EACH ROW
BEGIN
  UPDATE "ReplyVoiceProfile" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- CreateTable
CREATE TABLE "ReplyTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "ratingMin" INTEGER NOT NULL DEFAULT 1,
  "ratingMax" INTEGER NOT NULL DEFAULT 5,
  "sentiment" TEXT,
  "topicsJson" TEXT,
  "languageCode" TEXT,
  "instructions" TEXT,
  "bodyTemplate" TEXT,
  "variantHintsJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReplyTemplate_businessId_enabled_priority_idx" ON "ReplyTemplate"("businessId", "enabled", "priority");

CREATE TRIGGER "ReplyTemplate_updatedAt"
AFTER UPDATE ON "ReplyTemplate"
FOR EACH ROW
BEGIN
  UPDATE "ReplyTemplate" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = OLD."id";
END;

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN "reviewSignatureVariantsJson" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "replyLanguageCode" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "replyVariantsJson" TEXT;


