-- CreateTable
CREATE TABLE "JobRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "locationId" TEXT,
  "jobType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" DATETIME,
  "countsJson" TEXT,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "JobRun_businessId_startedAt_idx" ON "JobRun"("businessId", "startedAt");
CREATE INDEX "JobRun_locationId_idx" ON "JobRun"("locationId");
CREATE INDEX "JobRun_jobType_startedAt_idx" ON "JobRun"("jobType", "startedAt");



