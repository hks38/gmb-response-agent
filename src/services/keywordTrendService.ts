import { prisma } from '../db/client';
import { getLocationDetails, getLocationString } from './locationService';
import { generateDentalKeywords, extractKeywordsFromContent } from './keywordResearch';
import { getGoogleTrends, getGeoCode, calculateTrendChange } from './googleTrendsService';
import { llmService } from './llmService';
import { getDefaultBusinessId, getDefaultLocationId } from './tenantDefaults';

export interface WeeklyKeywordReport {
  location: string;
  latitude: number;
  longitude: number;
  radius: number;
  weekOf: Date;
  totalKeywords: number;
  topKeywords: Array<{
    keyword: string;
    searchVolume: number;
    trendScore: number;
    change: number;
  }>;
  trendingUp: string[];
  trendingDown: string[];
  summary?: string;
}

/**
 * Research and store keyword trends for a location
 */
export const researchKeywordTrends = async (params: {
  accountId: string;
  locationId: string;
  radius?: number; // in miles, default 10
  keywords?: string[]; // optional custom keywords
  businessId?: string;
  locationIdInternal?: string;
}): Promise<WeeklyKeywordReport> => {
  const { accountId, locationId, radius = 10, keywords: customKeywords } = params;
  const businessId = params.businessId || (await getDefaultBusinessId());
  const locationIdInternal = params.locationIdInternal || (await getDefaultLocationId());

  // Get location coordinates
  const locationDetails = await getLocationDetails({ accountId, locationId });
  const locationString = getLocationString(locationDetails);
  const geoCode = getGeoCode(locationString);

  // Get keywords to research
  let keywords: string[];
  if (customKeywords && customKeywords.length > 0) {
    keywords = customKeywords;
  } else {
    // Generate dental keywords
    keywords = generateDentalKeywords(locationString);
  }

  console.log(`Researching ${keywords.length} keywords for ${locationString} (geo: ${geoCode})...`);

  // Get trend data from Google Trends
  const trendResults = await getGoogleTrends({
    keywords,
    geo: geoCode,
    timeframe: 'today 3-m', // 3 months of data
  });

  // Get current week (Monday)
  const weekOf = getWeekStart(new Date());

  // Store trend data in database
  const keywordTrends = [];
  for (const trend of trendResults) {
    // Get previous week's data for comparison
    const previousWeek = new Date(weekOf);
    previousWeek.setDate(previousWeek.getDate() - 7);
    
    const previousTrend = await prisma.keywordTrend.findUnique({
      where: {
        businessId_keyword_location_weekOf: {
          businessId,
          keyword: trend.keyword,
          location: locationString,
          weekOf: previousWeek,
        },
      },
    });

    const previousWeekScore = previousTrend?.trendScore || 0;
    const change = calculateTrendChange(trend.currentValue, previousWeekScore);

    // Store or update trend
    const keywordTrend = await prisma.keywordTrend.upsert({
      where: {
        businessId_keyword_location_weekOf: {
          businessId,
          keyword: trend.keyword,
          location: locationString,
          weekOf,
        },
      },
      create: {
        businessId,
        locationId: locationIdInternal,
        keyword: trend.keyword,
        location: locationString,
        latitude: locationDetails.latitude,
        longitude: locationDetails.longitude,
        radius,
        searchVolume: trend.currentValue,
        trendScore: trend.averages.week,
        previousWeekScore,
        weekOf,
        category: categorizeKeyword(trend.keyword),
      },
      update: {
        searchVolume: trend.currentValue,
        trendScore: trend.averages.week,
        previousWeekScore,
        category: categorizeKeyword(trend.keyword),
      },
    });

    keywordTrends.push({
      keyword: trend.keyword,
      searchVolume: trend.currentValue,
      trendScore: trend.averages.week,
      change,
    });
  }

  // Sort by trend score and identify trending up/down
  keywordTrends.sort((a, b) => b.trendScore - a.trendScore);
  const topKeywords = keywordTrends.slice(0, 20);
  const trendingUp = keywordTrends
    .filter(k => k.change > 10)
    .map(k => k.keyword)
    .slice(0, 10);
  const trendingDown = keywordTrends
    .filter(k => k.change < -10)
    .map(k => k.keyword)
    .slice(0, 10);

  // Generate AI summary
  const summary = await generateWeeklySummary({
    location: locationString,
    topKeywords,
    trendingUp,
    trendingDown,
  });

  // Create weekly report
  const report = await prisma.keywordWeeklyReport.create({
    data: {
      businessId,
      locationId: locationIdInternal,
      reportDate: weekOf,
      location: locationString,
      latitude: locationDetails.latitude,
      longitude: locationDetails.longitude,
      radius,
      totalKeywords: keywordTrends.length,
      topKeywords: JSON.stringify(topKeywords.map(k => k.keyword)),
      trendingUp: JSON.stringify(trendingUp),
      trendingDown: JSON.stringify(trendingDown),
      summary,
    },
  });

  return {
    location: locationString,
    latitude: locationDetails.latitude,
    longitude: locationDetails.longitude,
    radius,
    weekOf,
    totalKeywords: keywordTrends.length,
    topKeywords: topKeywords,
    trendingUp,
    trendingDown,
    summary,
  };
};

/**
 * Get week start (Monday) for a given date
 */
const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

/**
 * Categorize keyword into dental categories
 */
const categorizeKeyword = (keyword: string): string => {
  const lower = keyword.toLowerCase();
  
  if (lower.includes('emergency') || lower.includes('urgent')) return 'emergency';
  if (lower.includes('pediatric') || lower.includes('kids') || lower.includes('children')) return 'pediatric';
  if (lower.includes('cosmetic') || lower.includes('whitening') || lower.includes('veneers') || lower.includes('smile')) return 'cosmetic';
  if (lower.includes('orthodontic') || lower.includes('braces') || lower.includes('invisalign')) return 'orthodontic';
  if (lower.includes('implant') || lower.includes('crown') || lower.includes('root canal') || lower.includes('extraction')) return 'restorative';
  if (lower.includes('cleaning') || lower.includes('checkup') || lower.includes('exam') || lower.includes('hygiene')) return 'preventive';
  
  return 'general';
};

/**
 * Generate AI summary of weekly keyword trends
 */
const generateWeeklySummary = async (params: {
  location: string;
  topKeywords: Array<{ keyword: string; searchVolume: number; trendScore: number; change: number }>;
  trendingUp: string[];
  trendingDown: string[];
}): Promise<string> => {
  const { location, topKeywords, trendingUp, trendingDown } = params;

  const prompt = `Analyze the weekly keyword trends for a dental practice in ${location}.

Top Keywords (this week):
${topKeywords.slice(0, 10).map((k, i) => `${i + 1}. ${k.keyword} (volume: ${k.searchVolume}, trend: ${k.change > 0 ? '+' : ''}${k.change}%)`).join('\n')}

Keywords Trending Up:
${trendingUp.length > 0 ? trendingUp.join(', ') : 'None'}

Keywords Trending Down:
${trendingDown.length > 0 ? trendingDown.join(', ') : 'None'}

Provide a concise summary (3-4 sentences) highlighting:
1. Most popular services/keywords this week
2. Emerging trends (keywords gaining popularity)
3. Key opportunities for content/SEO/marketing

Keep it professional and actionable.`;

  try {
    const response = await llmService.generate({
      prompt,
      responseFormat: 'text',
    });
    
    return response.content.trim();
  } catch (error: any) {
    console.error('Failed to generate summary:', error.message);
    return `Weekly keyword trends analyzed for ${location}. Top keywords: ${topKeywords.slice(0, 5).map(k => k.keyword).join(', ')}.`;
  }
};

/**
 * Get historical keyword trends
 */
export const getHistoricalTrends = async (params: {
  keyword?: string;
  location?: string;
  weeks?: number; // Number of weeks to retrieve
}): Promise<any[]> => {
  const { keyword, location, weeks = 12 } = params;

  const where: any = {};
  if (keyword) where.keyword = keyword;
  if (location) where.location = location;

  // Calculate date range
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (weeks * 7));

  where.weekOf = {
    gte: startDate,
  };

  const trends = await prisma.keywordTrend.findMany({
    where,
    orderBy: { weekOf: 'desc' },
  });

  return trends;
};

