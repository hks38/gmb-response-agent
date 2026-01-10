import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { createLocalPost } from '../src/services/googlePosts';
import { generateSmartPost } from '../src/services/smartPostGenerator';

dotenv.config();

const main = async () => {
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';
  const topic = process.argv[2]; // Optional topic argument (fallback if no report)
  const postType = (process.argv[3] as any) || 'STANDARD'; // STANDARD, EVENT, OFFER, ALERT
  const callToAction = (process.argv[4] as any) || 'LEARN_MORE'; // BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL
  const useReport = process.argv[5] !== 'false'; // Default: true

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  console.log('\n🎯 Creating SEO-targeted Google Business Profile Post\n');
  console.log(`   Mode: ${useReport ? 'Smart (uses weekly report if available)' : 'Custom topic only'}`);

  try {
    // Generate SEO-optimized post content using smart generator
    const result = await generateSmartPost({
      topic: topic || undefined, // Only use if provided, otherwise let smart generator decide
      postType,
      callToAction,
      ctaUrl: process.env.WEBSITE_URL || 'https://malama.dental',
      useWeeklyReport: useReport,
      maxPosts: 1,
    });

    const postContent = result.posts[0];
    
    if (result.source === 'weekly_report') {
      console.log(`📊 Generated from weekly keyword report`);
      if (result.keywords) {
        console.log(`   Keyword: ${result.keywords[0]}`);
      }
    } else {
      console.log(`📝 Generated with ${topic ? `custom topic: "${topic}"` : 'default topic'}`);
    }

    console.log('\n📄 Generated Post:');
    console.log(`   Summary: ${postContent.summary.substring(0, 150)}${postContent.summary.length > 150 ? '...' : ''}`);
    console.log(`   Type: ${postContent.topicType}`);
    console.log(`   Call-to-Action: ${postContent.callToAction?.actionType || 'None'}`);
    if (postContent.callToAction?.url) {
      console.log(`   CTA URL: ${postContent.callToAction.url}`);
    }
    console.log();

    // Ask for confirmation or proceed automatically
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;

    console.log('🚀 Posting to Google Business Profile...');

    const response = await createLocalPost({
      accountId,
      locationId: numericLocationId,
      post: {
        languageCode: 'en-US',
        summary: postContent.summary,
        callToAction: postContent.callToAction,
        topicType: postContent.topicType,
      },
    });

    console.log('\n✅ Post created successfully!');
    console.log(`   Post ID: ${response.name}`);
    console.log(`   State: ${response.state}`);
    console.log(`   Created: ${response.createTime}`);
    console.log(`   Summary: ${response.summary.substring(0, 100)}${response.summary.length > 100 ? '...' : ''}`);

    // Save to database (optional - for tracking)
    // You could create a Posts table if needed

  } catch (error: any) {
    console.error('\n❌ Error creating post:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure "My Business Business Information API" is enabled');
    console.error('   2. Check that your OAuth token has "business.manage" scope');
    console.error('   3. Verify GOOGLE_ACCOUNT_ID and GOOGLE_LOCATION_ID are correct');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();

