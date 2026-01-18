import { prisma } from '../db/client';

export interface BusinessSettingsDTO {
  businessName: string;
  businessLocation: string;
  websiteUrl: string;
  businessPhone?: string | null;
  businessEmail?: string | null;

  emailTo: string;

  schedulerEnabled: boolean;
  schedulerTz: string;
  dailyReviewsCron: string;
  twiceWeeklyPostCron: string;
  monthlyReportCron: string;
  avoidRepeatLastNPosts: number;

  reviewMinWords: number;
  reviewMaxWords: number;
  reviewSignature: string;
  reviewSignatureVariantsJson?: string | null;

  gmbPostMaxWords: number;

  bannedPhrases: string[];

  defaultUseSerpApiRankings: boolean;
  monthlyReportUseSerpApiRankings: boolean;
}

const parseJsonArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((s) => s.trim().length > 0);
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter((s) => s.trim().length > 0);
  } catch {
    // ignore
  }
  return [];
};

const defaultsFromEnv = (): Partial<BusinessSettingsDTO> => ({
  businessName: process.env.BUSINESS_NAME || undefined,
  businessLocation: process.env.BUSINESS_LOCATION || undefined,
  websiteUrl: process.env.WEBSITE_URL || undefined,
  businessPhone: process.env.BUSINESS_PHONE || undefined,
  businessEmail: process.env.BUSINESS_EMAIL || undefined,

  emailTo: process.env.EMAIL_TO || undefined,

  schedulerTz: process.env.SCHEDULER_TZ || undefined,
  dailyReviewsCron: process.env.DAILY_REVIEWS_CRON || undefined,
  twiceWeeklyPostCron: process.env.TWICE_WEEKLY_POST_CRON || undefined,
  monthlyReportCron: process.env.MONTHLY_REPORT_CRON || undefined,
});

export const getBusinessSettings = async (businessId: string): Promise<BusinessSettingsDTO> => {
  if (!businessId) throw new Error('businessId is required');

  // Ensure row exists (use defaults from schema)
  const row = await prisma.businessSettings.upsert({
    where: { businessId },
    create: { businessId },
    update: {},
  });

  const env = defaultsFromEnv();

  return {
    businessName: row.businessName || env.businessName || 'Malama Dental',
    businessLocation: row.businessLocation || env.businessLocation || 'Long Valley, NJ',
    websiteUrl: row.websiteUrl || env.websiteUrl || 'https://malama.dental',
    businessPhone: row.businessPhone ?? env.businessPhone ?? null,
    businessEmail: row.businessEmail ?? env.businessEmail ?? null,

    emailTo: row.emailTo || env.emailTo || 'malamadentalgroup@gmail.com',

    schedulerEnabled: row.schedulerEnabled,
    schedulerTz: row.schedulerTz || env.schedulerTz || 'America/New_York',
    dailyReviewsCron: row.dailyReviewsCron || env.dailyReviewsCron || '0 19 * * *',
    twiceWeeklyPostCron: row.twiceWeeklyPostCron || env.twiceWeeklyPostCron || '0 10 * * 2,5',
    monthlyReportCron: row.monthlyReportCron || env.monthlyReportCron || '0 9 1 * *',
    avoidRepeatLastNPosts: row.avoidRepeatLastNPosts,

    reviewMinWords: row.reviewMinWords,
    reviewMaxWords: row.reviewMaxWords,
    reviewSignature: row.reviewSignature,
    reviewSignatureVariantsJson: (row as any).reviewSignatureVariantsJson ?? null,

    gmbPostMaxWords: row.gmbPostMaxWords,

    bannedPhrases: parseJsonArray((row as any).bannedPhrasesJson),

    defaultUseSerpApiRankings: row.defaultUseSerpApiRankings,
    monthlyReportUseSerpApiRankings: row.monthlyReportUseSerpApiRankings,
  };
};

export const updateBusinessSettings = async (
  businessId: string,
  patch: Partial<BusinessSettingsDTO>
): Promise<BusinessSettingsDTO> => {
  const current = await getBusinessSettings(businessId);
  const merged: BusinessSettingsDTO = {
    ...current,
    ...patch,
  };

  const bannedPhrasesJson = JSON.stringify(
    Array.from(
      new Set((merged.bannedPhrases || []).map((s) => String(s).trim()).filter((s) => s.length > 0))
    )
  );

  await prisma.businessSettings.upsert({
    where: { businessId },
    create: { businessId, ...merged, bannedPhrasesJson } as any,
    update: { ...merged, bannedPhrasesJson } as any,
  });

  return await getBusinessSettings(businessId);
};

export const renderReviewSignature = (signatureTemplate: string, businessName: string): string => {
  return String(signatureTemplate || '')
    .split('{businessName}')
    .join(businessName)
    .trim();
};


