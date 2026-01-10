import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { researchKeywordTrends } from '../src/services/keywordTrendService';

dotenv.config();

const main = async () => {
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';
  const radius = parseInt(process.env.KEYWORD_RESEARCH_RADIUS || '10', 10);

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  console.log('\n🔍 Researching Dental Keywords for Weekly Trends\n');
  console.log(`   Location ID: ${locationId}`);
  console.log(`   Radius: ${radius} miles\n`);

  try {
    const report = await researchKeywordTrends({
      accountId,
      locationId,
      radius,
    });

    console.log('\n✅ Keyword Research Complete!\n');
    console.log(`📊 Weekly Report - Week of ${report.weekOf.toISOString().split('T')[0]}`);
    console.log(`   Location: ${report.location}`);
    console.log(`   Coordinates: ${report.latitude}, ${report.longitude}`);
    console.log(`   Radius: ${report.radius} miles`);
    console.log(`   Total Keywords Analyzed: ${report.totalKeywords}\n`);

    console.log('📈 Top 10 Keywords This Week:');
    report.topKeywords.slice(0, 10).forEach((kw, i) => {
      const changeIcon = kw.change > 0 ? '📈' : kw.change < 0 ? '📉' : '➡️';
      console.log(`   ${i + 1}. ${kw.keyword} - Volume: ${kw.searchVolume}, Trend: ${kw.trendScore} ${changeIcon} ${kw.change > 0 ? '+' : ''}${kw.change.toFixed(1)}%`);
    });

    if (report.trendingUp.length > 0) {
      console.log('\n🔥 Trending Up:');
      report.trendingUp.forEach(kw => console.log(`   • ${kw}`));
    }

    if (report.trendingDown.length > 0) {
      console.log('\n📉 Trending Down:');
      report.trendingDown.forEach(kw => console.log(`   • ${kw}`));
    }

    if (report.summary) {
      console.log('\n📝 AI Summary:');
      console.log(`   ${report.summary}\n`);
    }

    console.log('\n💡 Next Steps:');
    console.log('   • Use trending keywords in your GMB posts');
    console.log('   • Create content around popular keywords');
    console.log('   • Adjust marketing focus based on trends\n');
  } catch (error: any) {
    console.error('\n❌ Error researching keywords:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure GOOGLE_ACCOUNT_ID and GOOGLE_LOCATION_ID are set');
    console.error('   2. Check that your OAuth token has proper permissions');
    console.error('   3. Verify the location exists in your Google Business Profile');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();

