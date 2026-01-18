import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { getHistoricalTrends } from '../src/services/keywordTrendService';

dotenv.config();

const main = async () => {
  const keyword = process.argv[2]; // Optional keyword filter
  const location = process.env.GOOGLE_LOCATION_ID ? undefined : process.argv[3]; // Optional location filter
  const weeks = parseInt(process.argv[4] || '8', 10); // Number of weeks to show

  console.log('\n📊 Keyword Trends Report\n');

  try {
    // Get recent weekly reports
    const reports = await prisma.keywordWeeklyReport.findMany({
      where: location ? { location } : undefined,
      orderBy: { reportDate: 'desc' },
      take: 8,
    });

    if (reports.length === 0) {
      console.log('No weekly reports found. Run "npm run research-keywords" first.\n');
      process.exit(0);
    }

    console.log(`Found ${reports.length} weekly report(s):\n`);

    // Show most recent report
    const latestReport = reports[0];
    console.log(`📅 Latest Report - Week of ${latestReport.reportDate.toISOString().split('T')[0]}`);
    console.log(`   Location: ${latestReport.location}`);
    console.log(`   Total Keywords: ${latestReport.totalKeywords}\n`);

    const topKeywords = JSON.parse(latestReport.topKeywords || '[]');
    const trendingUp = JSON.parse(latestReport.trendingUp || '[]');
    const trendingDown = JSON.parse(latestReport.trendingDown || '[]');

    if (topKeywords.length > 0) {
      console.log('🔝 Top Keywords:');
      topKeywords.slice(0, 10).forEach((kw: string, i: number) => {
        console.log(`   ${i + 1}. ${kw}`);
      });
    }

    if (trendingUp.length > 0) {
      console.log('\n🔥 Trending Up:');
      trendingUp.slice(0, 5).forEach((kw: string) => {
        console.log(`   • ${kw}`);
      });
    }

    if (trendingDown.length > 0) {
      console.log('\n📉 Trending Down:');
      trendingDown.slice(0, 5).forEach((kw: string) => {
        console.log(`   • ${kw}`);
      });
    }

    if (latestReport.summary) {
      console.log('\n📝 Summary:');
      console.log(`   ${latestReport.summary}\n`);
    }

    // Show historical trends for specific keyword if provided
    if (keyword) {
      console.log(`\n📈 Historical Trends for "${keyword}" (last ${weeks} weeks):\n`);
      
      const trends = await getHistoricalTrends({
        keyword,
        location: latestReport.location,
        weeks,
      });

      if (trends.length === 0) {
        console.log(`   No historical data found for "${keyword}"`);
      } else {
        trends.forEach((trend) => {
          const change = trend.previousWeekScore 
            ? ((trend.trendScore - trend.previousWeekScore) / trend.previousWeekScore * 100).toFixed(1)
            : 'N/A';
          const changeIcon = change !== 'N/A' 
            ? (parseFloat(change) > 0 ? '📈' : parseFloat(change) < 0 ? '📉' : '➡️')
            : '';
          console.log(`   ${trend.weekOf.toISOString().split('T')[0]}: Volume ${trend.searchVolume || 'N/A'}, Trend ${trend.trendScore?.toFixed(1) || 'N/A'} ${changeIcon} ${change !== 'N/A' ? change + '%' : ''}`);
        });
      }
    }

    console.log();
  } catch (error: any) {
    console.error('❌ Error viewing trends:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();


