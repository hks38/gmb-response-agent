import { describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

const mockPrisma = {
  auditEvent: {
    create: vi.fn(),
  },
};

vi.mock('../src/db/client', () => ({ prisma: mockPrisma }));

describe('auditLogService', () => {
  it('writes hash-only audit event', async () => {
    mockPrisma.auditEvent.create.mockResolvedValue({ id: 'ae_1' });

    const { logAuditEvent } = await import('../src/services/auditLogService');

    const originalText = 'hello';
    const sanitizedText = 'hello world';

    await logAuditEvent({
      businessId: 'biz_default',
      actorUserId: 'user_1',
      actorRole: 'OWNER',
      action: 'POST_GMB_POST',
      targetType: 'POST',
      targetId: null,
      originalText,
      sanitizedText,
      violationCodes: ['BannedPhraseMatch'],
      metadata: { foo: 'bar' },
    });

    const expectedOriginal = crypto.createHash('sha256').update(originalText, 'utf8').digest('hex');
    const expectedSanitized = crypto.createHash('sha256').update(sanitizedText, 'utf8').digest('hex');

    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: 'biz_default',
        actorUserId: 'user_1',
        actorRole: 'OWNER',
        action: 'POST_GMB_POST',
        targetType: 'POST',
        targetId: null,
        originalSha256: expectedOriginal,
        sanitizedSha256: expectedSanitized,
        violationCodesJson: JSON.stringify(['BannedPhraseMatch']),
        metadataJson: JSON.stringify({ foo: 'bar' }),
      }),
    });
  });
});


