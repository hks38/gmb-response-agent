import * as readline from 'readline';
import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { createLocalPost } from '../src/services/googlePosts';
import { generateSmartPost } from '../src/services/smartPostGenerator';
import { getBusinessConfig } from '../src/services/businessConfig';

dotenv.config();

/**
 * Ask user for confirmation
 */
const askConfirmation = (question: string): Promise<boolean> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === 'yes' || normalized === 'y' || normalized === '1');
    });
  });
};

const main = async () => {
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';
  const topic = process.argv[2]; // Optional topic (fallback if no report)
  const postType = (process.argv[3] as any) || 'STANDARD';
  const callToAction = (process.argv[4] as any) || 'LEARN_MORE';
  const useReport = process.argv[5] !== 'false'; // Default: true, use --no-report to disable
  const maxPosts = parseInt(process.argv[6] || '1', 10);

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  const businessConfig = await getBusinessConfig();

  console.log('\n🎯 Smart GMB Post Generator - Interactive Mode\n');
  console.log(`   Business: ${businessConfig.name}`);
  console.log(`   Location: ${businessConfig.location}`);
  console.log(`   Mode: ${useReport ? 'Using weekly report (if available)' : 'Custom topic only'}`);
  if (topic && !useReport) {
    console.log(`   Topic: ${topic}`);
  }
  console.log(`   Post Type: ${postType}`);
  console.log(`   Call-to-Action: ${callToAction}`);
  console.log(`   Max Posts: ${maxPosts}\n`);

  try {
    // Generate post(s) using smart logic (but don't post yet)
    const result = await generateSmartPost({
      topic,
      postType,
      callToAction,
      ctaUrl: businessConfig.websiteUrl,
      useWeeklyReport: useReport,
      maxPosts,
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 POST GENERATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Source: ${result.source === 'weekly_report' ? '📈 Weekly Keyword Report' : '📝 Custom Topic'}`);
    if (result.keywords) {
      console.log(`   Keywords Used: ${result.keywords.join(', ')}`);
    }
    if (result.reportDate) {
      console.log(`   Report Date: ${result.reportDate.toISOString().split('T')[0]}`);
    }
    console.log(`   Posts Generated: ${result.posts.length}\n`);

    // Display each generated post and ask for confirmation
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;

    let posted = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < result.posts.length; i++) {
      const postContent = result.posts[i];
      const keyword = result.keywords?.[i] || topic || 'General dental care';

      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📄 POST ${i + 1}/${result.posts.length}`);
      console.log('─'.repeat(80));
      
      if (result.keywords) {
        console.log(`   Keyword: ${keyword}`);
      }
      console.log(`   Type: ${postContent.topicType}`);
      console.log(`   Call-to-Action: ${postContent.callToAction?.actionType || 'None'}`);
      if (postContent.callToAction?.url) {
        console.log(`   CTA URL: ${postContent.callToAction.url}`);
      }
      
      console.log(`\n   📝 POST CONTENT:`);
      console.log(`   ${'─'.repeat(76)}`);
      // Clean content if needed (handle JSON strings)
      let displayContent = postContent.summary;
      if (displayContent.startsWith('{') || displayContent.includes('"summary"')) {
        try {
          const parsed = JSON.parse(displayContent);
          displayContent = parsed.summary || parsed.content || parsed.text || parsed.post || displayContent;
        } catch {
          // Use as is if not valid JSON
        }
      }
      
      // Format the content with word wrap
      const words = displayContent.split(' ');
      let line = '   ';
      for (const word of words) {
        if ((line + word).length > 76) {
          console.log(line.trim());
          line = '   ' + word + ' ';
        } else {
          line += word + ' ';
        }
      }
      if (line.trim() !== '') {
        console.log(line.trim());
      }
      console.log(`   ${'─'.repeat(76)}`);
      
      const wordCount = displayContent.split(/\s+/).filter((w: string) => w.length > 0).length;
      console.log(`   Word Count: ${wordCount} words\n`);

      // Ask for confirmation
      const shouldPost = await askConfirmation(
        `   ✅ Does this post look correct? Post to ${businessConfig.name} GMB? (yes/no): `
      );

      if (!shouldPost) {
        console.log(`   ⏭️  Skipping post ${i + 1}...\n`);
        skipped += 1;
        continue;
      }

      // Post the content
      try {
        console.log(`   🚀 Posting to Google Business Profile...`);
        
        // Clean content before posting (handle JSON strings)
        let postSummary = postContent.summary;
        if (postSummary.startsWith('{') || postSummary.includes('"summary"')) {
          try {
            const parsed = JSON.parse(postSummary);
            postSummary = parsed.summary || parsed.content || parsed.text || parsed.post || postSummary;
          } catch {
            // Use as is if not valid JSON
          }
        }

        // Check if post has an image
        const imagePath = (postContent as any).imagePath;
        const media = imagePath ? [{
          mediaFormat: 'PHOTO' as const,
          sourceUrl: imagePath, // This may need to be a public URL - TODO: upload to cloud storage
        }] : undefined;

        // For now, if we have an image path, we'll need to upload it first or convert to base64
        // GMB API typically requires images to be publicly accessible URLs
        // TODO: Implement image upload to Google Cloud Storage or similar
        
        const response = await createLocalPost({
          accountId,
          locationId: numericLocationId,
          post: {
            languageCode: 'en-US',
            summary: postSummary,
            callToAction: postContent.callToAction,
            topicType: postContent.topicType,
            // Media will be added once we have proper upload mechanism
            // media: media, // Uncomment when image upload is implemented
          },
        });

        console.log(`   ✅ Posted successfully!`);
        console.log(`      Post ID: ${response.name}`);
        console.log(`      State: ${response.state}`);
        console.log(`      Created: ${response.createTime}\n`);
        posted += 1;

        // Delay before next post (except for the last one)
        if (i < result.posts.length - 1) {
          console.log(`   ⏳ Waiting 5 seconds before next post...\n`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error: any) {
        console.error(`   ❌ Failed to post: ${error.message}\n`);
        errors += 1;
      }
    }

    // Final summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ POSTING COMPLETE');
    console.log('='.repeat(80));
    console.log(`   Posted: ${posted}/${result.posts.length}`);
    console.log(`   Skipped: ${skipped}`);
    if (errors > 0) {
      console.log(`   Errors: ${errors}`);
    }
    console.log();

    // Suggestions
    if (result.source === 'weekly_report' && result.keywords) {
      console.log('💡 Posts were generated from weekly keyword trends!');
      console.log(`   These keywords are trending in your area: ${result.keywords.join(', ')}`);
    } else if (result.source === 'custom_topic') {
      console.log('💡 Tip: Run weekly keyword report to get trending keywords:');
      console.log(`   npm run weekly-keyword-report`);
      console.log(`   Then posts will automatically use trending keywords!`);
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

