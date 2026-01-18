import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGenerateSEOPost = vi.fn();
vi.mock('../src/services/seoPostGenerator', () => ({ generateSEOPost: mockGenerateSEOPost }));

const mockGenerateSmartPost = vi.fn();
vi.mock('../src/services/smartPostGenerator', () => ({ generateSmartPost: mockGenerateSmartPost }));

const mockCreateLocalPost = vi.fn();
const mockListLocalPosts = vi.fn();
vi.mock('../src/services/googlePosts', () => ({
  createLocalPost: mockCreateLocalPost,
  listLocalPosts: mockListLocalPosts,
}));

const mockGetBusinessSettings = vi.fn();
vi.mock('../src/services/settingsService', () => ({ getBusinessSettings: mockGetBusinessSettings }));

const mockRunComplianceGuard = vi.fn();
vi.mock('../src/services/complianceGuard', () => ({ runComplianceGuard: mockRunComplianceGuard }));

const mockLogAuditEvent = vi.fn();
vi.mock('../src/services/auditLogService', () => ({ logAuditEvent: mockLogAuditEvent }));

type MockRes = {
  statusCode: number;
  body: any;
  status: (code: number) => MockRes;
  json: (obj: any) => any;
};

const makeRes = (): MockRes => {
  const res: any = {
    statusCode: 200,
    body: undefined,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj: any) => {
    res.body = obj;
    return res;
  };
  return res as MockRes;
};

const runRoute = async (router: any, method: 'post' | 'get', path: string, req: any) => {
  const layer = router.stack.find((l: any) => l?.route?.path === path && l?.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  const stack = layer.route.stack.map((s: any) => s.handle);
  const res = makeRes();

  let idx = 0;
  const next = async (err?: any): Promise<void> => {
    if (err) throw err;
    const fn = stack[idx++];
    if (!fn) return;
    await new Promise<void>((resolve, reject) => {
      try {
        const maybe = fn(req, res, (e: any) => (e ? reject(e) : resolve()));
        // Support async handlers that return promises
        if (maybe && typeof maybe.then === 'function') {
          (maybe as Promise<any>).then(() => resolve()).catch(reject);
        }
      } catch (e) {
        reject(e);
      }
    });
    // If handler called next(), continue. If it ended response, fine.
    if (idx < stack.length && res.body === undefined) {
      await next();
    }
  };

  await next();
  return res;
};

beforeEach(() => {
  mockGenerateSEOPost.mockReset();
  mockCreateLocalPost.mockReset();
  mockListLocalPosts.mockReset();
  mockGetBusinessSettings.mockReset();
  mockRunComplianceGuard.mockReset();
  mockLogAuditEvent.mockReset();

  process.env.GOOGLE_ACCOUNT_ID = 'accounts/123';
  process.env.GOOGLE_LOCATION_ID = 'locations/456';
  process.env.WEBSITE_URL = 'https://example.com';
});

describe('posts routes (compliance + audit)', () => {
  it('POST / blocks when complianceGuard blocks', async () => {
    const postsRouter = (await import('../src/routes/posts')).default;

    mockGenerateSEOPost.mockResolvedValue({
      summary: 'DOB: 01/02/2000', // should be blocked by compliance (we mock it below)
      callToAction: { actionType: 'LEARN_MORE', url: 'https://example.com' },
      topicType: 'STANDARD',
    });
    mockGetBusinessSettings.mockResolvedValue({
      bannedPhrases: [],
      businessEmail: null,
      businessPhone: null,
    });
    mockRunComplianceGuard.mockReturnValue({
      blocked: true,
      sanitizedText: 'x',
      violations: [{ code: 'HighConfidencePHI' }],
    });

    const res = await runRoute(postsRouter, 'post', '/', {
      body: { topic: 'x' },
      tenant: { businessId: 'biz_default', role: 'OWNER', locationId: 'loc_default' },
      user: { userId: 'user_1' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('Post blocked by compliance guardrails');
    expect(mockCreateLocalPost).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it('POST / posts sanitized text and attempts audit logging', async () => {
    const postsRouter = (await import('../src/routes/posts')).default;

    mockGenerateSEOPost.mockResolvedValue({
      summary: 'original',
      callToAction: { actionType: 'LEARN_MORE', url: 'https://example.com' },
      topicType: 'STANDARD',
    });
    mockGetBusinessSettings.mockResolvedValue({
      bannedPhrases: ['bad'],
      businessEmail: 'office@example.com',
      businessPhone: '555-555-5555',
    });
    mockRunComplianceGuard.mockReturnValue({
      blocked: false,
      sanitizedText: 'sanitized',
      violations: [{ code: 'BannedPhraseMatch' }],
    });
    mockCreateLocalPost.mockResolvedValue({ name: 'posts/1', state: 'LIVE' });
    mockLogAuditEvent.mockResolvedValue(undefined);

    const res = await runRoute(postsRouter, 'post', '/', {
      body: { topic: 'x' },
      tenant: { businessId: 'biz_default', role: 'OWNER', locationId: 'loc_default' },
      user: { userId: 'user_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(mockCreateLocalPost).toHaveBeenCalledWith(
      expect.objectContaining({
        post: expect.objectContaining({ summary: 'sanitized' }),
      })
    );
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz_default',
        actorUserId: 'user_1',
        action: 'POST_GMB_POST',
        originalText: 'original',
        sanitizedText: 'sanitized',
      })
    );
  });

  it('POST /create does not fail if audit logging throws', async () => {
    const postsRouter = (await import('../src/routes/posts')).default;

    mockGetBusinessSettings.mockResolvedValue({
      bannedPhrases: [],
      businessEmail: null,
      businessPhone: null,
    });
    mockRunComplianceGuard.mockReturnValue({
      blocked: false,
      sanitizedText: 'clean',
      violations: [],
    });
    mockCreateLocalPost.mockResolvedValue({ name: 'posts/2', state: 'LIVE' });
    mockLogAuditEvent.mockRejectedValue(new Error('audit down'));

    const res = await runRoute(postsRouter, 'post', '/create', {
      body: { summary: 'hello', postType: 'STANDARD', callToAction: { actionType: 'CALL' }, media: [] },
      tenant: { businessId: 'biz_default', role: 'OWNER', locationId: 'loc_default' },
      user: { userId: 'user_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(mockCreateLocalPost).toHaveBeenCalledWith(
      expect.objectContaining({
        post: expect.objectContaining({ summary: 'clean' }),
      })
    );
  });
});


