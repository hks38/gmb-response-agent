import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPrisma = {
  location: { findFirst: vi.fn() },
  competitor: { findUnique: vi.fn(), upsert: vi.fn(), findFirst: vi.fn() },
  competitorSnapshot: { create: vi.fn(), findMany: vi.fn() },
  competitorTheme: { deleteMany: vi.fn(), create: vi.fn() },
  competitorKeywordProfile: { create: vi.fn() },
  keywordWeeklyReport: { findFirst: vi.fn() },
};
vi.mock('../src/db/client', () => ({ prisma: mockPrisma }));

vi.mock('../src/services/googlePlaces', () => ({
  isPlacesConfigured: vi.fn(() => true),
  searchTextPlaces: vi.fn(async () => ({
    places: [
      { id: 'place_1', displayName: { text: 'Comp A' }, formattedAddress: 'Addr', rating: 4.2, userRatingCount: 100 },
    ],
  })),
  getPlaceDetails: vi.fn(async () => ({
    id: 'place_1',
    displayName: { text: 'Comp A' },
    formattedAddress: 'Addr',
    rating: 4.2,
    userRatingCount: 100,
    reviews: [{ text: { text: 'Too expensive' }, rating: 2 }],
  })),
}));

vi.mock('../src/services/locationService', () => ({
  getLocationDetails: vi.fn(async () => ({ latitude: 40.0, longitude: -74.0 })),
}));

vi.mock('../src/services/llmService', () => ({
  llmService: {
    generate: vi.fn(async () => ({
      content: JSON.stringify({
        themes: [{ theme: 'Pricing', sentiment: 'negative', count: 1, examples: ['Too expensive'] }],
      }),
    })),
  },
}));

vi.mock('../src/services/websiteContext', () => ({
  getWebsiteContext: vi.fn(async () => ({
    practice_name: 'Comp A',
    location: 'X',
    phone: '',
    services: ['Dental cleaning'],
    unique_selling_points: [],
    url: 'https://example.com',
  })),
}));

describe('competitiveInsightsService', () => {
  beforeEach(() => {
    Object.values(mockPrisma).forEach((obj: any) => {
      Object.values(obj).forEach((fn: any) => fn.mockReset());
    });
  });

  it('computeVelocity produces per-day estimate', async () => {
    const { computeVelocity } = await import('../src/services/competitiveInsightsService');
    const latestAt = new Date('2026-01-08T00:00:00Z');
    const prevAt = new Date('2026-01-01T00:00:00Z');
    const v = computeVelocity({ latestCount: 140, prevCount: 100, latestAt, prevAt });
    expect(v.deltaCount).toBe(40);
    expect(Math.round(v.perDay * 10) / 10).toBeCloseTo(5.7, 1);
  });

  it('discoverCompetitors upserts discovered places, respecting locked entries', async () => {
    const { discoverCompetitors } = await import('../src/services/competitiveInsightsService');
    mockPrisma.location.findFirst.mockResolvedValueOnce({
      id: 'loc_default',
      businessId: 'biz_default',
      googleAccountId: 'accounts/123',
      googleLocationId: 'locations/456',
    });

    mockPrisma.competitor.findUnique.mockResolvedValueOnce({ id: 'c1', locked: true, status: 'active', source: 'manual' });
    mockPrisma.competitor.upsert.mockResolvedValueOnce({ id: 'c1' });

    const out = await discoverCompetitors({
      businessId: 'biz_default',
      locationIdInternal: 'loc_default',
      query: 'dentist',
      radiusMiles: 10,
      limit: 5,
    });

    expect(out.upserted).toBe(1);
    expect(mockPrisma.competitor.upsert).toHaveBeenCalledTimes(1);
  });

  it('ingestCompetitorSnapshot writes snapshot row', async () => {
    const { ingestCompetitorSnapshot } = await import('../src/services/competitiveInsightsService');
    mockPrisma.competitor.findFirst.mockResolvedValueOnce({ id: 'c1', businessId: 'biz_default', placeId: 'place_1', name: 'Comp A', locked: false });
    mockPrisma.competitorSnapshot.create.mockResolvedValueOnce({ id: 's1' });
    mockPrisma.competitor.update = vi.fn().mockResolvedValueOnce({});

    const out = await ingestCompetitorSnapshot({ businessId: 'biz_default', competitorId: 'c1' });
    expect(out.snapshot.id).toBe('s1');
    expect(mockPrisma.competitorSnapshot.create).toHaveBeenCalledTimes(1);
  });
});


