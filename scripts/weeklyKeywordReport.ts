import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { generateDentalKeywords } from '../src/services/keywordResearch';
import { getGoogleTrends, getGeoCode, calculateTrendChange } from '../src/services/googleTrendsService';
import { llmService } from '../src/services/llmService';

dotenv.config();

// All locations to research
const LOCATIONS = [
  'Long Valley, NJ',
  'Hackettstown, NJ',
  'Califon, NJ',
  'Tewksbury, NJ',
  'Flanders, NJ',
  'Budd Lake, NJ',
  'Chester, NJ',
  'Mendham, NJ',
  'Peapack and Gladstone, NJ',
];

const RADIUS = 10; // 10-mile radius

interface LocationReport {
  location: string;
  latitude: number;
  longitude: number;
  topKeywords: Array<{
    keyword: string;
    searchVolume: number;
    trendScore: number;
    change: number;
  }>;
  trendingUp: string[];
  trendingDown: string[];
  totalKeywords: number;
  categoryBreakdown: Record<string, number>;
}

const main = async () => {
  console.log('\n📊 Generating Weekly Keyword Report for All Locations\n');
  console.log(`📅 Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`📍 Locations: ${LOCATIONS.length}`);
  console.log(`🔍 Radius: ${RADIUS} miles\n`);

  const weekOf = getWeekStart(new Date());
  const reports: LocationReport[] = [];

  // Research keywords for each location
  for (let i = 0; i < LOCATIONS.length; i++) {
    const location = LOCATIONS[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${i + 1}/${LOCATIONS.length}] Researching: ${location}`);
    console.log('='.repeat(80));

    try {
      const report = await researchLocation(location, weekOf);
      reports.push(report);

      console.log(`✅ Completed: ${location}`);
      console.log(`   Top keywords: ${report.topKeywords.slice(0, 3).map(k => k.keyword).join(', ')}`);
      console.log(`   Trending up: ${report.trendingUp.length} keywords`);

      // Rate limiting between locations
      if (i < LOCATIONS.length - 1) {
        console.log(`   ⏳ Waiting 2 seconds before next location...\n`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error: any) {
      console.error(`❌ Error researching ${location}: ${error.message}`);
      // Continue with next location
    }
  }

  // Generate comprehensive report
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📋 GENERATING COMPREHENSIVE WEEKLY REPORT');
  console.log('='.repeat(80));

  const comprehensiveReport = await generateComprehensiveReport(reports, weekOf);

  // Save consolidated report
  console.log('\n💾 Saving consolidated report to database...');
  await saveConsolidatedReport(comprehensiveReport, weekOf);

  // Display summary
  displayReportSummary(comprehensiveReport, reports);

  console.log('\n✅ Weekly Report Complete!\n');
  console.log('💡 Next Steps:');
  console.log('   • Review top keywords across all locations');
  console.log('   • Create GMB posts using trending keywords');
  console.log('   • Adjust marketing strategy based on trends');
  console.log('   • Compare location-specific opportunities\n');
};

const researchLocation = async (location: string, weekOf: Date): Promise<LocationReport> => {
  const keywords = generateDentalKeywords(location);
  const geoCode = getGeoCode(location);
  const locationCoords = getLocationCoordinates(location);

  console.log(`   Researching ${keywords.length} keywords (geo: ${geoCode})...`);

  const trendResults = await getGoogleTrends({
    keywords,
    geo: geoCode,
    timeframe: 'today 3-m',
  });

  const keywordTrends = trendResults.map(trend => ({
    keyword: trend.keyword,
    searchVolume: trend.currentValue,
    trendScore: trend.averages.week,
    monthAvg: trend.averages.month,
    threeMonthAvg: trend.averages.threeMonths,
  }));

  // Get previous week's data for comparison
  const previousWeek = new Date(weekOf);
  previousWeek.setDate(previousWeek.getDate() - 7);

  const processedTrends = [];
  for (const trend of keywordTrends) {
    const previousTrend = await prisma.keywordTrend.findUnique({
      where: {
        keyword_location_weekOf: {
          keyword: trend.keyword,
          location: location,
          weekOf: previousWeek,
        },
      },
    });

    const previousWeekScore = previousTrend?.trendScore || 0;
    const change = calculateTrendChange(trend.trendScore, previousWeekScore);
    const changeVs3Month = trend.threeMonthAvg > 0 
      ? calculateTrendChange(trend.trendScore, trend.threeMonthAvg)
      : 0;

    await prisma.keywordTrend.upsert({
      where: {
        keyword_location_weekOf: {
          keyword: trend.keyword,
          location: location,
          weekOf,
        },
      },
      create: {
        keyword: trend.keyword,
        location: location,
        latitude: locationCoords.latitude,
        longitude: locationCoords.longitude,
        radius: RADIUS,
        searchVolume: trend.searchVolume,
        trendScore: trend.trendScore,
        previousWeekScore,
        weekOf,
        category: categorizeKeyword(trend.keyword),
      },
      update: {
        searchVolume: trend.searchVolume,
        trendScore: trend.trendScore,
        previousWeekScore,
        category: categorizeKeyword(trend.keyword),
      },
    });

    processedTrends.push({
      keyword: trend.keyword,
      searchVolume: trend.searchVolume,
      trendScore: trend.trendScore,
      change: changeVs3Month,
    });
  }

  processedTrends.sort((a, b) => b.trendScore - a.trendScore);

  const topKeywords = processedTrends.slice(0, 15);
  const trendingUp = processedTrends
    .filter(k => k.change > 10)
    .map(k => k.keyword)
    .slice(0, 10);
  const trendingDown = processedTrends
    .filter(k => k.change < -10)
    .map(k => k.keyword)
    .slice(0, 10);

  // Category breakdown
  const categoryBreakdown: Record<string, number> = {};
  for (const trend of processedTrends.slice(0, 20)) {
    const category = categorizeKeyword(trend.keyword);
    categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
  }

  return {
    location,
    latitude: locationCoords.latitude,
    longitude: locationCoords.longitude,
    topKeywords,
    trendingUp,
    trendingDown,
    totalKeywords: processedTrends.length,
    categoryBreakdown,
  };
};

const generateComprehensiveReport = async (
  reports: LocationReport[],
  weekOf: Date
): Promise<{
  summary: string;
  topKeywordsAllLocations: Array<{ keyword: string; locations: string[]; avgScore: number }>;
  trendingUpAll: Array<{ keyword: string; locations: string[] }>;
  insights: string;
}> => {
  // Aggregate keywords across all locations
  const keywordMap = new Map<string, { locations: Set<string>; scores: number[] }>();

  for (const report of reports) {
    for (const kw of report.topKeywords.slice(0, 10)) {
      if (!keywordMap.has(kw.keyword)) {
        keywordMap.set(kw.keyword, { locations: new Set(), scores: [] });
      }
      const entry = keywordMap.get(kw.keyword)!;
      entry.locations.add(report.location);
      entry.scores.push(kw.trendScore);
    }
  }

  // Calculate average scores
  const topKeywordsAllLocations = Array.from(keywordMap.entries())
    .map(([keyword, data]) => ({
      keyword,
      locations: Array.from(data.locations),
      avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 30);

  // Aggregate trending up keywords
  const trendingUpMap = new Map<string, Set<string>>();
  for (const report of reports) {
    for (const kw of report.trendingUp) {
      if (!trendingUpMap.has(kw)) {
        trendingUpMap.set(kw, new Set());
      }
      trendingUpMap.get(kw)!.add(report.location);
    }
  }

  const trendingUpAll = Array.from(trendingUpMap.entries())
    .map(([keyword, locations]) => ({
      keyword,
      locations: Array.from(locations),
    }))
    .sort((a, b) => b.locations.length - a.locations.length)
    .slice(0, 20);

  // Generate AI insights
  const insights = await generateAIInsights(reports, topKeywordsAllLocations, trendingUpAll);

  // Create summary
  const summary = `Weekly Keyword Report - Week of ${weekOf.toISOString().split('T')[0]}

Coverage: ${reports.length} locations across Morris County, NJ
Total Keywords Analyzed: ${reports.reduce((sum, r) => sum + r.totalKeywords, 0)}
Radius: ${RADIUS} miles per location

Top Performing Keywords (across all locations):
${topKeywordsAllLocations.slice(0, 10).map((kw, i) => 
  `${i + 1}. ${kw.keyword} (avg score: ${kw.avgScore.toFixed(1)}, locations: ${kw.locations.length})`
).join('\n')}

Trending Keywords (emerging across multiple locations):
${trendingUpAll.slice(0, 10).map((kw, i) => 
  `${i + 1}. ${kw.keyword} (trending in: ${kw.locations.join(', ')})`
).join('\n')}

${insights}`;

  return {
    summary,
    topKeywordsAllLocations,
    trendingUpAll,
    insights,
  };
};

const generateAIInsights = async (
  reports: LocationReport[],
  topKeywordsAll: Array<{ keyword: string; locations: string[]; avgScore: number }>,
  trendingUpAll: Array<{ keyword: string; locations: string[] }>
): Promise<string> => {
  const prompt = `Analyze weekly dental keyword trends for ${reports.length} locations in Morris County, NJ:

Locations: ${reports.map(r => r.location).join(', ')}

Top Keywords Across All Locations (average trend scores):
${topKeywordsAll.slice(0, 15).map((kw, i) => 
  `${i + 1}. ${kw.keyword} (score: ${kw.avgScore.toFixed(1)}, popular in ${kw.locations.length} locations)`
).join('\n')}

Keywords Trending Up (emerging across multiple locations):
${trendingUpAll.slice(0, 10).map((kw, i) => 
  `${i + 1}. ${kw.keyword} - trending in: ${kw.locations.join(', ')}`
).join('\n')}

Category Breakdown (top services):
${Object.entries(
  reports.reduce((acc, r) => {
    Object.entries(r.categoryBreakdown).forEach(([cat, count]) => {
      acc[cat] = (acc[cat] || 0) + count;
    });
    return acc;
  }, {} as Record<string, number>)
)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([cat, count]) => `  ${cat}: ${count}`)
  .join('\n')}

Provide comprehensive market insights (5-6 paragraphs) covering:
1. Overall market trends and demand patterns across all locations
2. Most popular services/keywords and regional variations
3. Emerging opportunities (keywords trending up across multiple locations)
4. Location-specific insights (which locations show unique trends)
5. Strategic marketing recommendations for a dental practice targeting this region
6. Competitive positioning opportunities

Be specific, data-driven, and actionable.`;

  try {
    const response = await llmService.generate({
      prompt,
      responseFormat: 'text',
    });
    return response.content.trim();
  } catch (error: any) {
    console.warn('⚠️  Failed to generate AI insights:', error.message);
    return `Market analysis for ${reports.length} locations in Morris County, NJ. Top keywords: ${topKeywordsAll.slice(0, 5).map(k => k.keyword).join(', ')}.`;
  }
};

const saveConsolidatedReport = async (
  report: {
    summary: string;
    topKeywordsAllLocations: Array<{ keyword: string; locations: string[]; avgScore: number }>;
    trendingUpAll: Array<{ keyword: string; locations: string[] }>;
    insights: string;
  },
  weekOf: Date
): Promise<void> => {
  // Calculate overall location (average of all locations)
  const reports = await prisma.keywordWeeklyReport.findMany({
    where: {
      reportDate: weekOf,
      location: {
        in: LOCATIONS,
      },
    },
  });

  if (reports.length > 0) {
    const avgLat = reports.reduce((sum, r) => sum + (r.latitude || 0), 0) / reports.length;
    const avgLng = reports.reduce((sum, r) => sum + (r.longitude || 0), 0) / reports.length;

    await prisma.keywordWeeklyReport.create({
      data: {
        reportDate: weekOf,
        location: 'Morris County, NJ (All Locations)',
        latitude: avgLat,
        longitude: avgLng,
        radius: RADIUS,
        totalKeywords: report.topKeywordsAllLocations.length,
        topKeywords: JSON.stringify(report.topKeywordsAllLocations.slice(0, 30).map(k => k.keyword)),
        trendingUp: JSON.stringify(report.trendingUpAll.slice(0, 20).map(k => k.keyword)),
        trendingDown: JSON.stringify([]),
        summary: report.insights,
      },
    });
  }
};

const displayReportSummary = (
  comprehensiveReport: {
    summary: string;
    topKeywordsAllLocations: Array<{ keyword: string; locations: string[]; avgScore: number }>;
    trendingUpAll: Array<{ keyword: string; locations: string[] }>;
    insights: string;
  },
  reports: LocationReport[]
): void => {
  console.log('\n📊 COMPREHENSIVE REPORT SUMMARY\n');
  console.log('Top 15 Keywords Across All Locations:');
  comprehensiveReport.topKeywordsAllLocations.slice(0, 15).forEach((kw, i) => {
    console.log(`   ${(i + 1).toString().padStart(2)}. ${kw.keyword.padEnd(45)} Score: ${kw.avgScore.toFixed(1).padStart(5)} (${kw.locations.length} locations)`);
  });

  if (comprehensiveReport.trendingUpAll.length > 0) {
    console.log('\n🔥 Trending Keywords Across Multiple Locations:');
    comprehensiveReport.trendingUpAll.slice(0, 10).forEach((kw, i) => {
      console.log(`   ${(i + 1).toString().padStart(2)}. ${kw.keyword.padEnd(45)} Trending in: ${kw.locations.join(', ')}`);
    });
  }

  console.log('\n📍 Location-Specific Top Keywords:');
  reports.forEach(report => {
    console.log(`\n   ${report.location}:`);
    report.topKeywords.slice(0, 3).forEach((kw, i) => {
      console.log(`      ${i + 1}. ${kw.keyword} (score: ${kw.trendScore.toFixed(1)}, change: ${kw.change > 0 ? '+' : ''}${kw.change.toFixed(1)}%)`);
    });
  });

  console.log('\n\n📝 MARKET INSIGHTS:\n');
  console.log(comprehensiveReport.insights);
  console.log('\n');
};

// Helper functions
const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

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

const getLocationCoordinates = (location: string): { latitude: number; longitude: number } => {
  const knownLocations: Record<string, { latitude: number; longitude: number }> = {
    'long valley, nj': { latitude: 40.7879, longitude: -74.7690 },
    'hackettstown, nj': { latitude: 40.8539, longitude: -74.8291 },
    'califon, nj': { latitude: 40.7190, longitude: -74.8360 },
    'tewksbury, nj': { latitude: 40.7179, longitude: -74.7554 },
    'flanders, nj': { latitude: 40.8432, longitude: -74.6910 },
    'budd lake, nj': { latitude: 40.8701, longitude: -74.7341 },
    'chester, nj': { latitude: 40.7843, longitude: -74.6968 },
    'mendham, nj': { latitude: 40.7759, longitude: -74.6007 },
    'peapack and gladstone, nj': { latitude: 40.7179, longitude: -74.6588 },
  };

  const key = location.toLowerCase();
  return knownLocations[key] || { latitude: 40.7879, longitude: -74.7690 }; // Default to Long Valley
};

main()
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

