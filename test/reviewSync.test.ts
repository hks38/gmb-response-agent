import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPrisma = {
  review: {
    aggregate: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
};
vi.mock('../src/db/client', () => ({ prisma: mockPrisma }));

const mockFetchGoogleReviews = vi.fn();
vi.mock('../src/services/googleReviews', () => ({ fetchGoogleReviews: mockFetchGoogleReviews }));

const mockAnalyzeReview = vi.fn();
vi.mock('../src/services/analysisService', () => ({ analyzeReview: mockAnalyzeReview }));

const mockDiscover = vi.fn();
vi.mock('../src/services/discoverLocation', () => ({ discoverFirstLocation: mockDiscover }));

beforeEach(() => {
  mockPrisma.review.aggregate.mockReset();
  mockPrisma.review.findUnique.mockReset();
  mockPrisma.review.update.mockReset();
  mockPrisma.review.upsert.mockReset();
  mockFetchGoogleReviews.mockReset();
  mockAnalyzeReview.mockReset();
  mockDiscover.mockReset();
});

describe('reviewSync', () => {
  it('syncs replied status for unchanged review when Google has reply', async () => {
    process.env.GOOGLE_LOCATION_ID = 'locations/456';
    process.env.DEFAULT_BUSINESS_ID = 'biz_default';
    process.env.DEFAULT_LOCATION_INTERNAL_ID = 'loc_default';
    mockPrisma.review.aggregate.mockResolvedValue({ _max: { updateTime: new Date('2025-01-01T00:00:00Z') } });

    mockFetchGoogleReviews.mockResolvedValue([
      {
        reviewId: 'r1',
        reviewer: { displayName: 'John Doe' },
        starRating: 5,
        comment: 'Nice',
        createTime: '2025-01-01T00:00:00Z',
        updateTime: '2025-01-01T00:00:00Z',
        reviewReply: { comment: 'Thanks!', updateTime: '2025-01-02T00:00:00Z' },
      },
    ]);

    mockPrisma.review.findUnique.mockResolvedValue({
      reviewId: 'r1',
      updateTime: new Date('2025-01-01T00:00:00Z'),
      repliedAt: null,
      status: 'Auto-Approved',
    });

    const { syncReviewsFromGoogle } = await import('../src/services/reviewSync');
    const result = await syncReviewsFromGoogle({ fetchAll: false });

    expect(mockPrisma.review.update).toHaveBeenCalledWith({
      where: { locationId_reviewId: { locationId: 'loc_default', reviewId: 'r1' } },
      data: expect.objectContaining({ status: 'Replied', repliedAt: expect.any(Date) }),
    });
    expect(result.analyzed).toBe(0);
    expect(result.newOrUpdatedSaved).toBe(0);
  });

  it('analyzes new/updated review and sets Auto-Approved vs Needs Approval based on rating/sentiment/risk', async () => {
    process.env.GOOGLE_LOCATION_ID = 'locations/456';
    process.env.DEFAULT_BUSINESS_ID = 'biz_default';
    process.env.DEFAULT_LOCATION_INTERNAL_ID = 'loc_default';
    mockPrisma.review.aggregate.mockResolvedValue({ _max: { updateTime: new Date('2025-01-01T00:00:00Z') } });

    mockFetchGoogleReviews.mockResolvedValue([
      {
        reviewId: 'r2',
        reviewer: { displayName: 'Jane Smith' },
        starRating: 'FIVE',
        comment: 'Amazing!',
        createTime: '2025-02-01T00:00:00Z',
        updateTime: '2025-02-01T00:00:00Z',
      },
      {
        reviewId: 'r3',
        reviewer: { displayName: 'Bob' },
        starRating: 2,
        comment: 'Bad',
        createTime: '2025-02-02T00:00:00Z',
        updateTime: '2025-02-02T00:00:00Z',
      },
    ]);

    // r2 is new
    mockPrisma.review.findUnique.mockResolvedValueOnce(null);
    mockAnalyzeReview.mockResolvedValueOnce({
      sentiment: 'positive',
      urgency: 'low',
      topics: [],
      suggested_actions: [],
      risk_flags: [],
      reply_draft: 'Thanks!',
    });

    // r3 is new
    mockPrisma.review.findUnique.mockResolvedValueOnce(null);
    mockAnalyzeReview.mockResolvedValueOnce({
      sentiment: 'negative',
      urgency: 'high',
      topics: [],
      suggested_actions: [],
      risk_flags: [],
      reply_draft: 'We would like to connect.',
    });

    const { syncReviewsFromGoogle } = await import('../src/services/reviewSync');
    const result = await syncReviewsFromGoogle({ fetchAll: false });

    // r2 upsert should set Auto-Approved
    expect(mockPrisma.review.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { locationId_reviewId: { locationId: 'loc_default', reviewId: 'r2' } },
        create: expect.objectContaining({
          status: 'Auto-Approved',
          businessId: 'biz_default',
          locationId: 'loc_default',
        }),
      })
    );

    // r3 should be Needs Approval (sentiment negative OR rating<=3)
    expect(mockPrisma.review.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { locationId_reviewId: { locationId: 'loc_default', reviewId: 'r3' } },
        create: expect.objectContaining({
          status: 'Needs Approval',
          businessId: 'biz_default',
          locationId: 'loc_default',
        }),
      })
    );

    expect(result.analyzed).toBe(2);
    expect(result.newOrUpdatedSaved).toBe(2);
  });
});



