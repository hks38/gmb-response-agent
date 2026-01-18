import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { analyzeGMBProfile } from '../src/services/gmbProfileAnalyzer';

dotenv.config();

const main = async () => {
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  console.log('\n🔍 Google My Business Profile Analysis\n');
  console.log('='.repeat(80));

  try {
    const analysis = await analyzeGMBProfile(accountId, locationId);

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('📊 ANALYSIS RESULTS');
    console.log('='.repeat(80));

    // Overall Score
    console.log(`\n🎯 Overall Profile Score: ${analysis.overallScore}/100`);
    const scoreColor =
      analysis.overallScore >= 80 ? '🟢' : analysis.overallScore >= 60 ? '🟡' : '🔴';
    console.log(`   ${scoreColor} ${getScoreRating(analysis.overallScore)}\n`);

    // Strengths
    console.log('✅ STRENGTHS:');
    console.log('-'.repeat(80));
    analysis.strengths.forEach((strength, i) => {
      console.log(`${i + 1}. ${strength}`);
    });

    // Weaknesses
    console.log('\n⚠️  WEAKNESSES:');
    console.log('-'.repeat(80));
    analysis.weaknesses.forEach((weakness, i) => {
      console.log(`${i + 1}. ${weakness}`);
    });

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('='.repeat(80));

    // Group by priority
    const highPriority = analysis.recommendations.filter(r => r.priority === 'high');
    const mediumPriority = analysis.recommendations.filter(r => r.priority === 'medium');
    const lowPriority = analysis.recommendations.filter(r => r.priority === 'low');

    if (highPriority.length > 0) {
      console.log('\n🔴 HIGH PRIORITY:');
      highPriority.forEach((rec, i) => {
        console.log(`\n${i + 1}. [${rec.category}] ${rec.title}`);
        console.log(`   ${rec.description}`);
        console.log(`   Action Items:`);
        rec.actionItems.forEach((item, j) => {
          console.log(`   • ${item}`);
        });
      });
    }

    if (mediumPriority.length > 0) {
      console.log('\n🟡 MEDIUM PRIORITY:');
      mediumPriority.forEach((rec, i) => {
        console.log(`\n${i + 1}. [${rec.category}] ${rec.title}`);
        console.log(`   ${rec.description}`);
        console.log(`   Action Items:`);
        rec.actionItems.forEach((item, j) => {
          console.log(`   • ${item}`);
        });
      });
    }

    if (lowPriority.length > 0) {
      console.log('\n🟢 LOW PRIORITY:');
      lowPriority.forEach((rec, i) => {
        console.log(`\n${i + 1}. [${rec.category}] ${rec.title}`);
        console.log(`   ${rec.description}`);
        console.log(`   Action Items:`);
        rec.actionItems.forEach((item, j) => {
          console.log(`   • ${item}`);
        });
      });
    }

    // Trend Analysis
    console.log('\n' + '='.repeat(80));
    console.log('📈 TREND ANALYSIS');
    console.log('='.repeat(80));
    console.log(`\n${analysis.trendAnalysis}`);

    // Growth Opportunities
    console.log('\n' + '='.repeat(80));
    console.log('🚀 GROWTH OPPORTUNITIES');
    console.log('='.repeat(80));
    analysis.growthOpportunities.forEach((opp, i) => {
      console.log(`\n${i + 1}. ${opp}`);
    });

    // AI Summary
    console.log('\n' + '='.repeat(80));
    console.log('📋 EXECUTIVE SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n${analysis.aiSummary}`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ Analysis Complete!');
    console.log('='.repeat(80));
    console.log('\n💡 Next Steps:');
    console.log('   1. Review high-priority recommendations');
    console.log('   2. Implement action items one at a time');
    console.log('   3. Monitor results and adjust strategy');
    console.log('   4. Re-run analysis monthly to track progress\n');

  } catch (error: any) {
    console.error('\n❌ Error analyzing profile:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check that GOOGLE_ACCOUNT_ID and GOOGLE_LOCATION_ID are set correctly');
    console.error('   2. Verify your OAuth token has proper permissions');
    console.error('   3. Ensure the APIs are enabled in Google Cloud Console');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

const getScoreRating = (score: number): string => {
  if (score >= 90) return 'Excellent - Profile is highly optimized';
  if (score >= 80) return 'Good - Minor improvements can boost performance';
  if (score >= 70) return 'Fair - Several areas need attention';
  if (score >= 60) return 'Needs Improvement - Significant work required';
  return 'Poor - Immediate action needed to improve profile';
};

main();


