import { describe, expect, it, vi } from 'vitest';

const mockPrisma = {
  businessSettings: {
    upsert: vi.fn(),
  },
};

vi.mock('../src/db/client', () => ({ prisma: mockPrisma }));

describe('settingsService', () => {
  it('getBusinessSettings upserts default row if missing and returns settings', async () => {
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
      gmbPostMaxWords: 150,
      bannedPhrasesJson: '["do not say this"]',
      defaultUseSerpApiRankings: false,
      monthlyReportUseSerpApiRankings: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { getBusinessSettings } = await import('../src/services/settingsService');
    const settings = await getBusinessSettings('biz_default');

    expect(mockPrisma.businessSettings.upsert).toHaveBeenCalledWith({
      where: { businessId: 'biz_default' },
      create: { businessId: 'biz_default' },
      update: {},
    });
    expect(settings.businessName).toBe('Malama Dental');
    expect(settings.reviewMinWords).toBe(25);
    expect(settings.bannedPhrases).toEqual(['do not say this']);
  });

  it('updateBusinessSettings merges and persists via upsert', async () => {
    const baseRow = {
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
      gmbPostMaxWords: 150,
      bannedPhrasesJson: '[]',
      defaultUseSerpApiRankings: false,
      monthlyReportUseSerpApiRankings: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // updateBusinessSettings calls getBusinessSettings twice; both use upsert
    mockPrisma.businessSettings.upsert
      .mockResolvedValueOnce(baseRow) // getBusinessSettings before merge
      .mockResolvedValueOnce({ ...baseRow, reviewMinWords: 30, reviewMaxWords: 120, bannedPhrasesJson: '["x"]' }) // persist
      .mockResolvedValueOnce({ ...baseRow, reviewMinWords: 30, reviewMaxWords: 120, bannedPhrasesJson: '["x"]' }); // final read

    const { updateBusinessSettings } = await import('../src/services/settingsService');
    const updated = await updateBusinessSettings('biz_default', {
      reviewMinWords: 30,
      reviewMaxWords: 120,
      bannedPhrases: ['x'],
    });

    expect(mockPrisma.businessSettings.upsert).toHaveBeenCalled();
    expect(updated.reviewMinWords).toBe(30);
    expect(updated.reviewMaxWords).toBe(120);
    expect(updated.bannedPhrases).toEqual(['x']);
  });

  it('renderReviewSignature replaces {businessName}', async () => {
    const { renderReviewSignature } = await import('../src/services/settingsService');
    const rendered = renderReviewSignature('Warm regards,\n{businessName} Team', 'Acme Dental');
    expect(rendered).toBe('Warm regards,\nAcme Dental Team');
  });
});


