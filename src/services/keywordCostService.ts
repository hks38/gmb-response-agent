import { prisma } from '../db/client';
import { googleAdsService, KeywordCostData } from './googleAdsService';
import { getPracticeAreas } from './geographicService';

export interface SpecialtyKeyword {
  keyword: string;
  specialtyType: string;
}

// Define specialty keywords for different procedures
export const SPECIALTY_KEYWORDS: SpecialtyKeyword[] = [
  { keyword: 'full mouth veneers', specialtyType: 'veneers' },
  { keyword: 'full mouth veneers near me', specialtyType: 'veneers' },
  { keyword: 'porcelain veneers', specialtyType: 'veneers' },
  { keyword: 'dental veneers', specialtyType: 'veneers' },
  { keyword: 'invisalign', specialtyType: 'invisalign' },
  { keyword: 'invisalign near me', specialtyType: 'invisalign' },
  { keyword: 'invisalign treatment', specialtyType: 'invisalign' },
  { keyword: 'clear aligners', specialtyType: 'invisalign' },
  { keyword: 'all on 4 dental implants', specialtyType: 'all-on-4' },
  { keyword: 'all on 4', specialtyType: 'all-on-4' },
  { keyword: 'all-on-4 implants', specialtyType: 'all-on-4' },
  { keyword: 'all on 4 near me', specialtyType: 'all-on-4' },
  { keyword: 'dental implants', specialtyType: 'implants' },
  { keyword: 'dental implants near me', specialtyType: 'implants' },
  { keyword: 'tooth implant', specialtyType: 'implants' },
  { keyword: 'implant dentistry', specialtyType: 'implants' },
  { keyword: 'cosmetic dentistry', specialtyType: 'cosmetic' },
  { keyword: 'cosmetic dentist', specialtyType: 'cosmetic' },
  { keyword: 'smile makeover', specialtyType: 'cosmetic' },
  { keyword: 'full mouth reconstruction', specialtyType: 'cosmetic' },
];

/**
 * Fetch keyword costs for all areas in a practice
 */
export async function fetchKeywordCostsForPractice(
  practiceId: string,
  forceRefresh: boolean = false
): Promise<void> {
  // Get all areas for the practice
  const areas = await getPracticeAreas(practiceId);

  if (areas.length === 0) {
    throw new Error(`No areas found for practice ${practiceId}`);
  }

  // Get all specialty keywords
  const keywords = SPECIALTY_KEYWORDS.map(sk => sk.keyword);

  // Fetch costs for each area
  for (const area of areas) {
    // Get the area record from database
    const areaRecord = await prisma.area.findFirst({
      where: {
        practiceId,
        name: area.name,
      },
    });

    if (!areaRecord) {
      console.warn(`Area record not found for ${area.name}`);
      continue;
    }

    // Check if we have recent data (within 24 hours)
    if (!forceRefresh) {
      const recentCosts = await prisma.keywordCost.findFirst({
        where: {
          areaId: areaRecord.id,
          fetchedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      });

      if (recentCosts) {
        console.log(`Skipping ${area.name} - recent data exists`);
        continue;
      }
    }

    // Fetch keyword costs from Google Ads API
    const costData = await googleAdsService.getKeywordCosts(
      keywords,
      area.geocode
    );

    // Delete old costs for this area
    await prisma.keywordCost.deleteMany({
      where: { areaId: areaRecord.id },
    });

    // Save new costs
    for (const cost of costData) {
      const specialtyKeyword = SPECIALTY_KEYWORDS.find(
        sk => sk.keyword.toLowerCase() === cost.keyword.toLowerCase()
      );

      await prisma.keywordCost.create({
        data: {
          keyword: cost.keyword,
          areaId: areaRecord.id,
          avgCpc: cost.avgCpc,
          minCpc: cost.minCpc,
          maxCpc: cost.maxCpc,
          searchVolume: cost.searchVolume,
          competition: cost.competition,
          specialtyType: specialtyKeyword?.specialtyType || null,
        },
      });
    }

    console.log(`Fetched costs for ${area.name}: ${costData.length} keywords`);
  }
}

/**
 * Get keyword costs for a specific area
 */
export async function getKeywordCostsForArea(areaId: string) {
  return await prisma.keywordCost.findMany({
    where: { areaId },
    orderBy: { avgCpc: 'desc' },
  });
}

/**
 * Get keyword costs filtered by specialty type
 */
export async function getKeywordCostsBySpecialty(
  practiceId: string,
  specialtyType?: string
) {
  const areas = await prisma.area.findMany({
    where: { practiceId },
  });

  const where: any = {
    areaId: { in: areas.map(a => a.id) },
  };

  if (specialtyType) {
    where.specialtyType = specialtyType;
  }

  return await prisma.keywordCost.findMany({
    where,
    include: {
      area: true,
    },
    orderBy: { avgCpc: 'desc' },
  });
}

/**
 * Get aggregated keyword costs across all areas
 */
export async function getAggregatedKeywordCosts(practiceId: string) {
  const areas = await prisma.area.findMany({
    where: { practiceId },
  });

  const costs = await prisma.keywordCost.findMany({
    where: {
      areaId: { in: areas.map(a => a.id) },
    },
    include: {
      area: true,
    },
  });

  // Group by keyword and calculate averages
  const keywordMap = new Map<string, {
    keyword: string;
    avgCpc: number;
    minCpc: number;
    maxCpc: number;
    totalVolume: number;
    areaCount: number;
    competition: string;
    specialtyType: string | null;
  }>();

  for (const cost of costs) {
    const existing = keywordMap.get(cost.keyword);
    if (existing) {
      existing.avgCpc = (existing.avgCpc * existing.areaCount + cost.avgCpc) / (existing.areaCount + 1);
      existing.minCpc = Math.min(existing.minCpc, cost.minCpc);
      existing.maxCpc = Math.max(existing.maxCpc, cost.maxCpc);
      existing.totalVolume += cost.searchVolume;
      existing.areaCount += 1;
    } else {
      keywordMap.set(cost.keyword, {
        keyword: cost.keyword,
        avgCpc: cost.avgCpc,
        minCpc: cost.minCpc,
        maxCpc: cost.maxCpc,
        totalVolume: cost.searchVolume,
        areaCount: 1,
        competition: cost.competition,
        specialtyType: cost.specialtyType,
      });
    }
  }

  return Array.from(keywordMap.values()).sort((a, b) => b.avgCpc - a.avgCpc);
}


