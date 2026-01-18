import { describe, expect, it, vi, beforeEach } from 'vitest';

const scheduled: Array<{ expr: string; fn: () => any; opts: any; task: any }> = [];

vi.mock('node-cron', () => {
  return {
    default: {
      schedule: (expr: string, fn: () => any, opts: any) => {
        const task = { stop: vi.fn() };
        scheduled.push({ expr, fn, opts, task });
        return task;
      },
    },
  };
});

const mockSendEmail = vi.fn();
vi.mock('../src/services/emailService', () => ({ sendEmail: mockSendEmail }));

const mockSync = vi.fn();
vi.mock('../src/services/reviewSync', () => ({ syncReviewsFromGoogle: mockSync }));

const mockGetBusinessSettings = vi.fn();
vi.mock('../src/services/settingsService', () => ({ getBusinessSettings: mockGetBusinessSettings }));

const mockResearchTrends = vi.fn();
vi.mock('../src/services/keywordTrendService', () => ({ researchKeywordTrends: mockResearchTrends }));

const mockListPosts = vi.fn();
const mockCreatePost = vi.fn();
vi.mock('../src/services/googlePosts', () => ({
  listLocalPosts: mockListPosts,
  createLocalPost: mockCreatePost,
}));

const mockGenerateSEOPost = vi.fn();
vi.mock('../src/services/seoPostGenerator', () => ({ generateSEOPost: mockGenerateSEOPost }));

const mockGetRankings = vi.fn();
vi.mock('../src/services/serpRankingService', () => ({ getRankingsForKeywords: mockGetRankings }));

const mockLLMGenerate = vi.fn();
vi.mock('../src/services/llmService', () => ({ llmService: { generate: mockLLMGenerate } }));

const mockPrisma = {
  businessSettings: {
    findMany: vi.fn(),
  },
  jobRun: {
    create: vi.fn(),
    update: vi.fn(),
  },
  review: {
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  keywordWeeklyReport: {
    findFirst: vi.fn(),
  },
};
vi.mock('../src/db/client', () => ({ prisma: mockPrisma }));

beforeEach(() => {
  scheduled.splice(0, scheduled.length);
  mockSendEmail.mockReset();
  mockSync.mockReset();
  mockGetBusinessSettings.mockReset();
  mockResearchTrends.mockReset();
  mockListPosts.mockReset();
  mockCreatePost.mockReset();
  mockGenerateSEOPost.mockReset();
  mockGetRankings.mockReset();
  mockLLMGenerate.mockReset();
  mockPrisma.businessSettings.findMany.mockReset();
  mockPrisma.jobRun.create.mockReset();
  mockPrisma.jobRun.update.mockReset();
  mockPrisma.review.findMany.mockReset();
  mockPrisma.review.update.mockReset();
  mockPrisma.review.count.mockReset();
  mockPrisma.keywordWeeklyReport.findFirst.mockReset();

  process.env.GOOGLE_ACCOUNT_ID = 'accounts/123';
  process.env.GOOGLE_LOCATION_ID = 'locations/456';
  process.env.DEFAULT_BUSINESS_ID = 'biz_default';
  process.env.DEFAULT_LOCATION_INTERNAL_ID = 'loc_default';
});

describe('scheduler', () => {
  it('reloadScheduler schedules no jobs when schedulerEnabled=false', async () => {
    mockPrisma.businessSettings.findMany.mockResolvedValue([]);

    const { reloadScheduler } = await import('../src/jobs/scheduler');
    await reloadScheduler();

    expect(scheduled.length).toBe(0);
  });

  it('reloadScheduler schedules 3 jobs with configured cron + timezone when enabled', async () => {
    mockPrisma.businessSettings.findMany.mockResolvedValue([
      {
        businessId: 'biz_default',
        schedulerEnabled: true,
        createdAt: new Date(),
        business: {
          id: 'biz_default',
          name: 'Malama Dental',
          locations: [
            {
              id: 'loc_default',
              googleAccountId: 'accounts/123',
              googleLocationId: 'locations/456',
            },
          ],
        },
      },
    ]);
    mockGetBusinessSettings.mockResolvedValue({
      schedulerEnabled: true,
      schedulerTz: 'America/New_York',
      emailTo: 'malamadentalgroup@gmail.com',
      dailyReviewsCron: '0 19 * * *',
      twiceWeeklyPostCron: '0 10 * * 2,5',
      monthlyReportCron: '0 9 1 * *',
      avoidRepeatLastNPosts: 5,
      monthlyReportUseSerpApiRankings: false,
      businessName: 'Malama Dental',
      businessLocation: 'Long Valley, NJ',
      websiteUrl: 'https://malama.dental',
      businessPhone: '555-555-5555',
    });

    const { reloadScheduler } = await import('../src/jobs/scheduler');
    await reloadScheduler();

    expect(scheduled.map((s) => s.expr)).toEqual(['0 19 * * *', '0 10 * * 2,5', '0 9 1 * *', '10 * * * *']);
    for (const s of scheduled) expect(s.opts.timezone).toBe('America/New_York');
  });

  it('daily job sends email only if newOrUpdatedSaved > 0', async () => {
    mockPrisma.businessSettings.findMany.mockResolvedValue([
      {
        businessId: 'biz_default',
        schedulerEnabled: true,
        createdAt: new Date(),
        business: {
          id: 'biz_default',
          name: 'Malama Dental',
          locations: [
            {
              id: 'loc_default',
              googleAccountId: 'accounts/123',
              googleLocationId: 'locations/456',
            },
          ],
        },
      },
    ]);
    mockGetBusinessSettings.mockResolvedValue({
      schedulerEnabled: true,
      schedulerTz: 'America/New_York',
      emailTo: 'malamadentalgroup@gmail.com',
      dailyReviewsCron: '0 19 * * *',
      twiceWeeklyPostCron: '0 10 * * 2,5',
      monthlyReportCron: '0 9 1 * *',
      avoidRepeatLastNPosts: 5,
      monthlyReportUseSerpApiRankings: false,
      businessName: 'Malama Dental',
      businessLocation: 'Long Valley, NJ',
      websiteUrl: 'https://malama.dental',
      businessPhone: '555-555-5555',
    });

    mockPrisma.jobRun.create.mockResolvedValue({ id: 'run1' });
    mockPrisma.jobRun.update.mockResolvedValue({});

    mockSync.mockResolvedValueOnce({ newOrUpdatedSaved: 0, fetchedFromGoogle: 0, processed: 0, analyzed: 0, errors: 0 });

    const { reloadScheduler } = await import('../src/jobs/scheduler');
    await reloadScheduler();

    // First scheduled job is daily
    await scheduled[0].fn();
    expect(mockSendEmail).not.toHaveBeenCalled();

    mockSync.mockResolvedValueOnce({ newOrUpdatedSaved: 2, fetchedFromGoogle: 2, processed: 2, analyzed: 2, errors: 0 });
    mockPrisma.review.findMany.mockResolvedValueOnce([
      { authorName: 'A', rating: 5, createTime: new Date(), comment: 'Great', replyDraft: 'Thanks', status: 'Auto-Approved' },
    ]);

    await scheduled[0].fn();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].to).toBe('malamadentalgroup@gmail.com');
  });

  it('monthly job respects monthlyReportUseSerpApiRankings toggle', async () => {
    mockPrisma.businessSettings.findMany.mockResolvedValue([
      {
        businessId: 'biz_default',
        schedulerEnabled: true,
        createdAt: new Date(),
        business: {
          id: 'biz_default',
          name: 'Malama Dental',
          locations: [
            {
              id: 'loc_default',
              googleAccountId: 'accounts/123',
              googleLocationId: 'locations/456',
            },
          ],
        },
      },
    ]);
    mockGetBusinessSettings.mockResolvedValue({
      schedulerEnabled: true,
      schedulerTz: 'America/New_York',
      emailTo: 'malamadentalgroup@gmail.com',
      dailyReviewsCron: '0 19 * * *',
      twiceWeeklyPostCron: '0 10 * * 2,5',
      monthlyReportCron: '0 9 1 * *',
      avoidRepeatLastNPosts: 5,
      monthlyReportUseSerpApiRankings: false,
      businessName: 'Malama Dental',
      businessLocation: 'Long Valley, NJ',
      websiteUrl: 'https://malama.dental',
      businessPhone: '555-555-5555',
    });

    mockPrisma.jobRun.create.mockResolvedValue({ id: 'runM' });
    mockPrisma.jobRun.update.mockResolvedValue({});
    mockPrisma.review.count.mockResolvedValue(0);
    mockListPosts.mockResolvedValue([]);
    mockLLMGenerate.mockRejectedValue(new Error('no llm'));

    const { reloadScheduler } = await import('../src/jobs/scheduler');
    await reloadScheduler();

    // Third scheduled job is monthly
    await scheduled[2].fn();
    expect(mockGetRankings).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('reminder job emails assignee for overdue Needs Approval reviews and updates reminder state', async () => {
    mockPrisma.businessSettings.findMany.mockResolvedValue([
      {
        businessId: 'biz_default',
        schedulerEnabled: true,
        createdAt: new Date(),
        business: {
          id: 'biz_default',
          name: 'Malama Dental',
          locations: [
            {
              id: 'loc_default',
              googleAccountId: 'accounts/123',
              googleLocationId: 'locations/456',
            },
          ],
        },
      },
    ]);
    mockGetBusinessSettings.mockResolvedValue({
      schedulerEnabled: true,
      schedulerTz: 'America/New_York',
      emailTo: 'malamadentalgroup@gmail.com',
      dailyReviewsCron: '0 19 * * *',
      twiceWeeklyPostCron: '0 10 * * 2,5',
      monthlyReportCron: '0 9 1 * *',
      avoidRepeatLastNPosts: 5,
      monthlyReportUseSerpApiRankings: false,
      businessName: 'Malama Dental',
      businessLocation: 'Long Valley, NJ',
      websiteUrl: 'https://malama.dental',
      businessPhone: '555-555-5555',
    });

    mockPrisma.jobRun.create.mockResolvedValue({ id: 'runR' });
    mockPrisma.jobRun.update.mockResolvedValue({});

    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    mockPrisma.review.findMany.mockResolvedValueOnce([
      {
        id: 123,
        businessId: 'biz_default',
        authorName: 'A',
        rating: 2,
        comment: 'Bad',
        replyDraft: 'We are sorry...',
        status: 'Needs Approval',
        createTime: new Date(),
        lastAnalyzedAt: new Date(),
        needsApprovalSince: twoDaysAgo,
        lastReminderAt: null,
        escalationLevel: 0,
        riskFlags: JSON.stringify(['HIPAA risk']),
        assignedTo: { email: 'staff@example.com' },
      },
    ]);
    mockPrisma.review.update.mockResolvedValueOnce({});

    const { reloadScheduler } = await import('../src/jobs/scheduler');
    await reloadScheduler();

    // Fourth scheduled job is reminders
    await scheduled[3].fn();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].to).toBe('staff@example.com');
    expect(String(mockSendEmail.mock.calls[0][0].subject)).toContain('Review approvals needed');
    expect(mockPrisma.review.update).toHaveBeenCalledTimes(1);
  });
});



