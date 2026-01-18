import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  generateEnhancedContent: vi.fn().mockResolvedValue({
    content: 'Test post content',
    wordCount: 5,
    keywordsIncluded: [],
    verified: true,
    iterations: 1,
    promptUsed: 'x',
    verificationIssues: [],
  }),
}));

// Use the real settingsService, but mock Prisma so settings come from an in-memory row.
const mockPrisma = vi.hoisted(() => ({
  businessSettings: {
    upsert: vi.fn(),
  },
}));
vi.mock('../src/db/client', () => ({ prisma: mockPrisma }));

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

vi.mock('../src/services/imageGenerator', () => ({
  generatePostImage: vi.fn().mockResolvedValue({ imagePath: undefined }),
}));

vi.mock('../src/services/enhancedContentGenerator', () => ({
  generateEnhancedContent: hoisted.generateEnhancedContent,
}));

describe('seoPostGenerator', () => {
  it('uses settings-driven gmbPostMaxWords when generating posts', async () => {
    // mockReset=true clears implementations between tests, so set them inside the test.
    process.env.DEFAULT_BUSINESS_ID = 'biz_default';
    mockPrisma.businessSettings.upsert.mockResolvedValue({
      id: 'bizset_default',
      businessId: 'biz_default',
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
      reviewMaxWords: 150,
      reviewSignature: 'Warm regards,\n{businessName} Team',
      gmbPostMaxWords: 77,
      defaultUseSerpApiRankings: false,
      monthlyReportUseSerpApiRankings: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    hoisted.generateEnhancedContent.mockResolvedValue({
      content: 'Test post content',
      wordCount: 5,
      keywordsIncluded: [],
      verified: true,
      iterations: 1,
      promptUsed: 'x',
      verificationIssues: [],
    });

    const { generateSEOPost } = await import('../src/services/seoPostGenerator');

    await generateSEOPost({ topic: 'Dental cleaning', callToAction: 'LEARN_MORE' });

    expect(hoisted.generateEnhancedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'seo_post',
        maxWords: 77,
      })
    );
  });
});


