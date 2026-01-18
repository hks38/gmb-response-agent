import { describe, expect, it, vi } from 'vitest';

// Mock settings + business config
vi.mock('../src/services/settingsService', () => ({
  getBusinessSettings: vi.fn().mockResolvedValue({
    businessName: 'Malama Dental',
    businessLocation: 'Long Valley, NJ',
    websiteUrl: 'https://malama.dental',
    businessPhone: null,
    businessEmail: null,
    emailTo: 'malamadentalgroup@gmail.com',
    schedulerEnabled: true,
    schedulerTz: 'America/New_York',
    dailyReviewsCron: '0 19 * * *',
    twiceWeeklyPostCron: '0 10 * * 2,5',
    monthlyReportCron: '0 9 1 * *',
    avoidRepeatLastNPosts: 5,
    reviewMinWords: 25,
    reviewMaxWords: 90,
    reviewSignature: 'Warm regards,\n{businessName} Team',
    reviewSignatureVariantsJson: null,
    gmbPostMaxWords: 150,
    bannedPhrases: [],
    defaultUseSerpApiRankings: false,
    monthlyReportUseSerpApiRankings: true,
  }),
  renderReviewSignature: (tpl: string, businessName: string) =>
    String(tpl).split('{businessName}').join(businessName),
}));

vi.mock('../src/services/businessConfig', () => ({
  getBusinessConfig: vi.fn().mockResolvedValue({
    name: 'Malama Dental',
    location: 'Long Valley, NJ',
    websiteUrl: 'https://malama.dental',
    phone: '555-555-5555',
    email: 'malamadentalgroup@gmail.com',
  }),
}));

vi.mock('../src/services/websiteContext', () => ({
  getWebsiteContext: vi.fn().mockResolvedValue(null),
}));

// LLM analysis JSON
vi.mock('../src/services/llmService', () => ({
  llmService: {
    generate: vi.fn().mockResolvedValue({
      provider: 'mock',
      model: 'mock',
      content: JSON.stringify({
        sentiment: 'positive',
        urgency: 'low',
        languageCode: 'en',
        topics: ['friendly staff'],
        suggested_actions: ['thank them'],
        risk_flags: [],
      }),
    }),
  },
}));

vi.mock('../src/services/replyVoiceService', () => ({
  getActiveVoiceProfile: vi.fn().mockResolvedValue({
    id: 'voice_default',
    name: 'Default',
    enabled: true,
    tone: 'warm',
    style: 'concise',
    doList: [],
    dontList: [],
    examplePhrases: [],
    bannedPhrases: [],
  }),
}));

vi.mock('../src/services/replyTemplateService', () => ({
  selectReplyTemplate: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/services/replyVariantService', () => ({
  generateReplyVariants: vi.fn().mockResolvedValue({
    A: {
      text: 'Dear Will,\n\nThank you for the kind words about our team.\n\nWarm regards,\nMalama Dental Team',
      qc: { ok: true, blocked: false, issues: [], violations: [], sanitizedText: '', wordCount: 30 },
    },
    B: {
      text: 'Dear Will,\n\nWe truly appreciate your kind feedback.\n\nWarm regards,\nMalama Dental Team',
      qc: { ok: true, blocked: false, issues: [], violations: [], sanitizedText: '', wordCount: 30 },
    },
    selected: 'A',
    languageCode: 'en',
    templateId: null,
    voiceProfileId: 'voice_default',
  }),
}));

describe('analysisService', () => {
  it('uses first name only in greeting and ends with settings-driven signature', async () => {
    process.env.DEFAULT_BUSINESS_ID = 'biz_default';
    const { analyzeReview } = await import('../src/services/analysisService');

    const result = await analyzeReview({
      authorName: 'Will Tagliareni',
      rating: 5,
      comment: 'Great experience!',
      createTime: new Date().toISOString(),
      businessId: 'biz_default',
      reviewId: 'review_123',
    });

    expect(result.reply_draft).toMatch(/^Dear Will,/);
    expect(result.reply_draft).not.toMatch(/Dear Will Tagliareni/);
    expect(result.reply_draft).not.toMatch(/,\s*Will/);
    expect(result.reply_draft.trim()).toMatch(/Warm regards,\nMalama Dental Team$/);
    expect(result.reply_language_code).toBe('en');
    expect(result.reply_variants?.selected).toBe('A');
  });
});



