import { describe, expect, it, vi } from 'vitest';

const mockPrisma = {
  replyTemplate: {
    findMany: vi.fn(),
  },
};

vi.mock('../src/db/client', () => ({ prisma: mockPrisma }));

describe('replyTemplateService', () => {
  it('selects highest-priority matching template by rating/sentiment/topic/language', async () => {
    mockPrisma.replyTemplate.findMany.mockResolvedValue([
      {
        id: 't_low',
        name: 'Low priority',
        enabled: true,
        priority: 1,
        ratingMin: 1,
        ratingMax: 5,
        sentiment: null,
        topicsJson: null,
        languageCode: null,
        instructions: null,
        bodyTemplate: null,
        variantHintsJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        businessId: 'biz_default',
      },
      {
        id: 't_high',
        name: 'High priority Spanish billing',
        enabled: true,
        priority: 10,
        ratingMin: 1,
        ratingMax: 5,
        sentiment: 'negative',
        topicsJson: JSON.stringify(['billing', 'wait time']),
        languageCode: 'es',
        instructions: 'Be extra apologetic.',
        bodyTemplate: '...',
        variantHintsJson: JSON.stringify({ A: 'Concise', B: 'Empathetic' }),
        createdAt: new Date(),
        updatedAt: new Date(),
        businessId: 'biz_default',
      },
    ]);

    const { selectReplyTemplate } = await import('../src/services/replyTemplateService');
    const selected = await selectReplyTemplate({
      businessId: 'biz_default',
      rating: 2,
      sentiment: 'negative',
      topics: ['billing'],
      languageCode: 'es-MX',
    });

    expect(selected?.id).toBe('t_high');
    expect(selected?.variantHints?.A).toBe('Concise');
  });
});


