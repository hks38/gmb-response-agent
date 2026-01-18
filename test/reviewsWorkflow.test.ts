import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPrismaTx = {
  review: {
    update: vi.fn(),
  },
  reviewReplyVersion: {
    create: vi.fn(),
  },
};

const mockPrisma = {
  review: {
    findFirst: vi.fn(),
  },
  businessMembership: {
    findUnique: vi.fn(),
  },
  reviewReplyVersion: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(async (fn: any) => fn(mockPrismaTx)),
};

vi.mock('../src/db/client', () => ({ prisma: mockPrisma }));
vi.mock('../src/services/settingsService', () => ({ getBusinessSettings: vi.fn() }));
vi.mock('../src/services/complianceGuard', () => ({ runComplianceGuard: vi.fn(() => ({ blocked: false, violations: [], sanitizedText: '' })) }));
vi.mock('../src/services/auditLogService', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../src/services/postReply', () => ({ postReplyToReview: vi.fn() }));
vi.mock('../src/services/analysisService', () => ({
  analyzeReview: vi.fn(async () => ({
    sentiment: 'positive',
    urgency: 'low',
    topics: ['staff'],
    suggested_actions: ['none'],
    risk_flags: [],
    reply_draft: 'Dear A,\n\nThanks!\n\nWarm regards,\nX Team',
  })),
}));

const findRouteHandlers = (router: any, method: string, path: string) => {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((s: any) => s.handle);
};

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

beforeEach(() => {
  mockPrisma.review.findFirst.mockReset();
  mockPrisma.businessMembership.findUnique.mockReset();
  mockPrisma.reviewReplyVersion.findMany.mockReset();
  mockPrisma.reviewReplyVersion.findFirst.mockReset();
  mockPrisma.$transaction.mockClear();
  mockPrismaTx.review.update.mockReset();
  mockPrismaTx.reviewReplyVersion.create.mockReset();
});

describe('reviews workflow routes', () => {
  it('PATCH /:id/reply appends a human version when replyDraft changes', async () => {
    const reviewsRouter = (await import('../src/routes/reviews')).default as any;

    mockPrisma.review.findFirst.mockResolvedValueOnce({
      id: 1,
      businessId: 'biz_1',
      replyDraft: 'old',
      status: 'Needs Approval',
      needsApprovalSince: null,
    });
    mockPrismaTx.review.update.mockResolvedValueOnce({
      id: 1,
      businessId: 'biz_1',
      replyDraft: 'new',
      status: 'Needs Approval',
      topics: null,
      suggestedActions: null,
      riskFlags: null,
    });

    const handlers = findRouteHandlers(reviewsRouter, 'patch', '/:id/reply');

    const req: any = {
      params: { id: '1' },
      body: { replyDraft: 'new' },
      tenant: { businessId: 'biz_1', role: 'OWNER' },
      user: { userId: 'u_1' },
    };
    const res = makeRes();

    // handler[0] is requireRole middleware, handler[1] is actual handler
    await new Promise<void>((resolve) => handlers[0](req, res, resolve));
    await handlers[1](req, res);

    expect(mockPrismaTx.reviewReplyVersion.create).toHaveBeenCalledTimes(1);
    const call = mockPrismaTx.reviewReplyVersion.create.mock.calls[0][0];
    expect(call.data.source).toBe('human');
    expect(call.data.note).toBe('edit');
    expect(call.data.text).toBe('new');
  });

  it('POST /:id/analyze appends an ai version when generating a reply draft', async () => {
    const reviewsRouter = (await import('../src/routes/reviews')).default as any;

    mockPrisma.review.findFirst.mockResolvedValueOnce({
      id: 2,
      businessId: 'biz_1',
      authorName: 'A',
      rating: 5,
      comment: 'Great',
      createTime: new Date(),
      needsApprovalSince: null,
    });
    mockPrismaTx.review.update.mockResolvedValueOnce({
      id: 2,
      businessId: 'biz_1',
      replyDraft: 'Dear A,\n\nThanks!\n\nWarm regards,\nX Team',
      status: 'Auto-Approved',
      topics: JSON.stringify(['staff']),
      suggestedActions: JSON.stringify(['none']),
      riskFlags: JSON.stringify([]),
    });

    const handlers = findRouteHandlers(reviewsRouter, 'post', '/:id/analyze');

    const req: any = {
      params: { id: '2' },
      body: {},
      tenant: { businessId: 'biz_1', role: 'STAFF' },
      user: { userId: 'u_1' },
    };
    const res = makeRes();

    await handlers[0](req, res);

    expect(mockPrismaTx.reviewReplyVersion.create).toHaveBeenCalledTimes(1);
    const call = mockPrismaTx.reviewReplyVersion.create.mock.calls[0][0];
    expect(call.data.source).toBe('ai');
    expect(call.data.note).toBe('analyze');
  });
});


