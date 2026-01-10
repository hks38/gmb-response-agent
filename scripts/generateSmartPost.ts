import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { generatePostWithConfirmation, PostWithConfirmationOptions } from '../src/services/contentGeneratorWithConfirmation';

dotenv.config();

const main = async () => {
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';
  const topic = process.argv[2]; // Optional topic (fallback if no report)
  const postType = (process.argv[3] as any) || 'STANDARD';
  const callToAction = (process.argv[4] as any) || 'LEARN_MORE';
  const useReport = process.argv[5] !== 'false'; // Default: true, use 'false' to disable
  const maxPosts = parseInt(process.argv[6] || '1', 10);

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  console.log('\n🎯 Smart GMB Post Generator (With Confirmation)\n');
  console.log(`   Mode: ${useReport ? 'Using weekly report (if available)' : 'Custom topic only'}`);
  if (topic && !useReport) {
    console.log(`   Topic: ${topic}`);
  }
  console.log(`   Post Type: ${postType}`);
  console.log(`   Call-to-Action: ${callToAction}`);
  console.log(`   Max Posts: ${maxPosts}\n`);

  try {
    // Generate post with confirmation
    const result = await generatePostWithConfirmation({
      accountId,
      locationId,
      topic,
      postType,
      callToAction,
      ctaUrl: process.env.WEBSITE_URL || 'https://malama.dental',
      useWeeklyReport: useReport,
      maxPosts: 1, // Generate one at a time for confirmation
    });

    if (result.posted) {
      console.log('\n✅ Post successfully published to Google Business Profile!');
    } else if (!result.userConfirmed) {
      console.log('\n⚠️  Post generation cancelled. No post was published.');
    }

    // Suggestions
    if (result.posted) {
      console.log('\n💡 Next Steps:');
      console.log('   • Monitor post engagement in Google Business Profile');
      if (useReport) {
        console.log('   • Generate more posts using trending keywords');
      } else {
        console.log('   • Run weekly keyword report for data-driven posts:');
        console.log('     npm run weekly-keyword-report');
      }
    }
    console.log();

  } catch (error: any) {
    console.error('\n❌ Error generating post:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure weekly keyword report exists: npm run weekly-keyword-report');
    console.error('   2. Check that GOOGLE_ACCOUNT_ID and GOOGLE_LOCATION_ID are set');
    console.error('   3. Verify your OAuth token has proper permissions');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();

