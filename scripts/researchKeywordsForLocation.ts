import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { generateDentalKeywords } from '../src/services/keywordResearch';
import { getGoogleTrends, getGeoCode, calculateTrendChange } from '../src/services/googleTrendsService';
import { llmService } from '../src/services/llmService';

dotenv.config();

const main = async () => {
  const location = process.argv[2] || 'Hackettstown, NJ';
  const radius = parseInt(process.argv[3] || '10', 10);

  console.log(`\n🔍 Researching Dental Keywords for ${location}\n`);
  console.log(`   Radius: ${radius} miles\n`);

  try {
    // Get coordinates (using approximate for Hackettstown, NJ)
    const locationCoords = getLocationCoordinates(location);
    const geoCode = getGeoCode(location);
    
    // Generate dental keywords for this location
    const keywords = generateDentalKeywords(location);

    console.log(`Researching ${keywords.length} keywords for ${location} (geo: ${geoCode})...\n`);

    // Get trend data from Google Trends
    const trendResults = await getGoogleTrends({
      keywords,
      geo: geoCode,
      timeframe: 'today 3-m', // 3 months of data
    });

    // Process and display results
    const keywordTrends = trendResults.map(trend => ({
      keyword: trend.keyword,
      searchVolume: trend.currentValue,
      trendScore: trend.averages.week,
      monthAvg: trend.averages.month,
      threeMonthAvg: trend.averages.threeMonths,
    }));

    // Sort by trend score
    keywordTrends.sort((a, b) => b.trendScore - a.trendScore);

    // Get current week (Monday)
    const weekOf = getWeekStart(new Date());

    // Store trends in database
    for (const trend of keywordTrends) {
      const previousWeek = new Date(weekOf);
      previousWeek.setDate(previousWeek.getDate() - 7);
      
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
          radius,
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
    }

    // Identify trending keywords
    const trendingUp = keywordTrends
      .filter(k => k.trendScore > k.threeMonthAvg * 1.1) // 10% above 3-month average
      .slice(0, 10)
      .map(k => k.keyword);
    
    const trendingDown = keywordTrends
      .filter(k => k.trendScore < k.threeMonthAvg * 0.9) // 10% below 3-month average
      .slice(0, 10)
      .map(k => k.keyword);

    console.log('\n✅ Keyword Research Complete!\n');
    console.log(`📊 Weekly Report - Week of ${weekOf.toISOString().split('T')[0]}`);
    console.log(`   Location: ${location}`);
    console.log(`   Coordinates: ${locationCoords.latitude}, ${locationCoords.longitude}`);
    console.log(`   Radius: ${radius} miles`);
    console.log(`   Total Keywords Analyzed: ${keywordTrends.length}\n`);

    console.log('📈 Top 15 Keywords This Week:');
    keywordTrends.slice(0, 15).forEach((kw, i) => {
      const changeVs3Month = ((kw.trendScore - kw.threeMonthAvg) / kw.threeMonthAvg * 100);
      const changeVs3MonthStr = changeVs3Month.toFixed(1);
      const changeIcon = changeVs3Month > 0 ? '📈' : changeVs3Month < 0 ? '📉' : '➡️';
      console.log(`   ${(i + 1).toString().padStart(2)}. ${kw.keyword.padEnd(40)} Volume: ${kw.searchVolume.toString().padStart(3)}, Trend: ${kw.trendScore.toFixed(1).padStart(5)} ${changeIcon} ${changeVs3Month > 0 ? '+' : ''}${changeVs3MonthStr}% vs 3mo`);
    });

    if (trendingUp.length > 0) {
      console.log('\n🔥 Trending Up (vs 3-month average):');
      trendingUp.forEach(kw => console.log(`   • ${kw}`));
    }

    if (trendingDown.length > 0) {
      console.log('\n📉 Trending Down (vs 3-month average):');
      trendingDown.forEach(kw => console.log(`   • ${kw}`));
    }

    // Generate AI summary
    console.log('\n📝 Generating AI Summary...');
    const summary = await generateSummary({
      location,
      topKeywords: keywordTrends.slice(0, 15),
      trendingUp,
      trendingDown,
    });

    if (summary) {
      console.log(`\n📋 Market Analysis Summary:\n${summary}\n`);
    }

    // Create weekly report
    const report = await prisma.keywordWeeklyReport.create({
      data: {
        reportDate: weekOf,
        location: location,
        latitude: locationCoords.latitude,
        longitude: locationCoords.longitude,
        radius,
        totalKeywords: keywordTrends.length,
        topKeywords: JSON.stringify(keywordTrends.slice(0, 20).map(k => k.keyword)),
        trendingUp: JSON.stringify(trendingUp),
        trendingDown: JSON.stringify(trendingDown),
        summary,
      },
    });

    console.log(`\n✅ Weekly report saved (ID: ${report.id})\n`);

    console.log('💡 Next Steps:');
    console.log('   • Use trending keywords in your GMB posts');
    console.log('   • Create content around popular keywords');
    console.log('   • Adjust marketing focus based on trends');
    console.log('   • Compare with other locations to identify opportunities\n');

  } catch (error: any) {
    console.error('\n❌ Error researching keywords:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure you have a valid location name (e.g., "Hackettstown, NJ")');
    console.error('   2. Check your internet connection');
    console.error('   3. The system uses Google Trends which may have rate limits');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
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
  // Approximate coordinates for common NJ locations
  const knownLocations: Record<string, { latitude: number; longitude: number }> = {
    'hackettstown, nj': { latitude: 40.8539, longitude: -74.8291 },
    'long valley, nj': { latitude: 40.7879, longitude: -74.7690 },
    'morristown, nj': { latitude: 40.7970, longitude: -74.4814 },
    'randolph, nj': { latitude: 40.8484, longitude: -74.5810 },
  };

  const key = location.toLowerCase();
  if (knownLocations[key]) {
    return knownLocations[key];
  }

  // Default to Hackettstown if unknown
  return { latitude: 40.8539, longitude: -74.8291 };
};

const generateSummary = async (params: {
  location: string;
  topKeywords: Array<{ keyword: string; searchVolume: number; trendScore: number }>;
  trendingUp: string[];
  trendingDown: string[];
}): Promise<string> => {
  const { location, topKeywords, trendingUp, trendingDown } = params;

  const prompt = `Analyze the dental keyword search trends for ${location}. Provide insights for a dental practice considering this market.

Top Keywords (this week):
${topKeywords.map((k, i) => `${i + 1}. ${k.keyword} (search volume: ${k.searchVolume}, trend score: ${k.trendScore.toFixed(1)})`).join('\n')}

Keywords Trending Up:
${trendingUp.length > 0 ? trendingUp.join(', ') : 'None significant'}

Keywords Trending Down:
${trendingDown.length > 0 ? trendingDown.join(', ') : 'None significant'}

Provide a comprehensive market analysis (4-5 paragraphs) covering:
1. Overall market demand and search volume trends
2. Most popular services/keywords and what this indicates about patient needs
3. Emerging trends and growth opportunities
4. Competitive landscape insights (what services are most searched)
5. Marketing and SEO recommendations for a dental practice in this area

Be specific, data-driven, and actionable. Focus on insights that would help a dental practice understand the local market.`;

  try {
    const response = await llmService.generate({
      prompt,
      responseFormat: 'text',
    });
    
    return response.content.trim();
  } catch (error: any) {
    console.error('Failed to generate summary:', error.message);
    return `Market analysis for ${location}. Top keywords: ${topKeywords.slice(0, 5).map(k => k.keyword).join(', ')}.`;
  }
};

main();

