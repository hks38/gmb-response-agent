import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { createLocalPost } from '../src/services/googlePosts';
import { generateMultipleSEOPosts } from '../src/services/seoPostGenerator';

dotenv.config();

const main = async () => {
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  // Default topics for dental practice SEO posts
  const defaultTopics = [
    'Comprehensive dental cleaning and checkup services',
    'Gentle family dental care for all ages',
    'Preventive dentistry and oral health tips',
    'Teeth whitening and cosmetic dental services',
    'Emergency dental care availability',
    'New patient welcome and special offers',
  ];

  // Get topics from command line or use defaults
  const topicsArg = process.argv[2];
  const topics = topicsArg 
    ? topicsArg.split(',').map(t => t.trim())
    : defaultTopics;

  const postType = (process.argv[3] as any) || 'STANDARD';
  const delayBetweenPosts = parseInt(process.argv[4] || '5', 10); // seconds

  console.log(`\n🎯 Creating ${topics.length} SEO-targeted posts\n`);
  console.log(`   Post Type: ${postType}`);
  console.log(`   Delay between posts: ${delayBetweenPosts} seconds\n`);

  try {
    // Generate all post contents first
    console.log('📝 Generating post content...\n');
    const postContents = await generateMultipleSEOPosts(topics, {
      postType,
      callToAction: 'LEARN_MORE',
      ctaUrl: process.env.WEBSITE_URL || 'https://malama.dental',
    });

    console.log(`✅ Generated ${postContents.length} post(s)\n`);

    // Post each one to Google Business Profile
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;

    let posted = 0;
    let errors = 0;

    for (let i = 0; i < postContents.length; i++) {
      const postContent = postContents[i];
      const topic = topics[i];

      console.log(`\n📄 Post ${i + 1}/${postContents.length}: "${topic}"`);
      console.log(`   Summary: ${postContent.summary.substring(0, 100)}...`);

      try {
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

        console.log(`   ✅ Posted successfully! (ID: ${response.name})`);
        console.log(`   State: ${response.state}`);
        posted += 1;

        // Delay before next post (except for the last one)
        if (i < postContents.length - 1) {
          console.log(`   ⏳ Waiting ${delayBetweenPosts} seconds before next post...\n`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenPosts * 1000));
        }
      } catch (error: any) {
        console.error(`   ❌ Failed to post: ${error.message}`);
        errors += 1;
      }
    }

    console.log(`\n\n✅ Batch posting complete!`);
    console.log(`   Posted: ${posted}/${postContents.length}`);
    if (errors > 0) {
      console.log(`   Errors: ${errors}`);
    }
    console.log();
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();


