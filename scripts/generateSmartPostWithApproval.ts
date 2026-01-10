import dotenv from 'dotenv';
import * as readline from 'readline';
import { prisma } from '../src/db/client';
import { createLocalPost } from '../src/services/googlePosts';
import { generateSmartPost } from '../src/services/smartPostGenerator';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
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

  console.log('\n🎯 Smart GMB Post Generator (With Approval)\n');
  console.log(`   Mode: ${useReport ? 'Using weekly report (if available)' : 'Custom topic only'}`);
  if (topic && !useReport) {
    console.log(`   Topic: ${topic}`);
  }
  console.log(`   Post Type: ${postType}`);
  console.log(`   Call-to-Action: ${callToAction}`);
  console.log(`   Max Posts: ${maxPosts}\n`);

  try {
    // Generate post(s) using smart logic
    const result = await generateSmartPost({
      topic,
      postType,
      callToAction,
      ctaUrl: process.env.WEBSITE_URL || 'https://malama.dental',
      useWeeklyReport: useReport,
      maxPosts,
    });

    console.log(`\n📊 Post Generation Summary:`);
    console.log(`   Source: ${result.source === 'weekly_report' ? '📈 Weekly Keyword Report' : '📝 Custom Topic'}`);
    if (result.keywords) {
      console.log(`   Keywords Used: ${result.keywords.join(', ')}`);
    }
    if (result.reportDate) {
      console.log(`   Report Date: ${result.reportDate.toISOString().split('T')[0]}`);
    }
    console.log(`   Posts Generated: ${result.posts.length}\n`);

    // Show preview and ask for approval for each post
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;

    let posted = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < result.posts.length; i++) {
      const postContent = result.posts[i];
      const keyword = result.keywords?.[i] || topic || 'General dental care';

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📄 POST PREVIEW ${i + 1}/${result.posts.length}`);
      console.log('='.repeat(80));
      
      if (result.keywords) {
        console.log(`Keyword: ${keyword}`);
      }
      console.log(`\nPost Type: ${postContent.topicType}`);
      console.log(`Call-to-Action: ${postContent.callToAction?.actionType || 'None'}`);
      if (postContent.callToAction?.url) {
        console.log(`CTA URL: ${postContent.callToAction.url}`);
      }
      
      console.log(`\n📝 Post Content:`);
      console.log('-'.repeat(80));
      // Clean up content if it's JSON wrapped
      let displayContent = postContent.summary;
      if (displayContent.startsWith('{')) {
        try {
          const parsed = JSON.parse(displayContent);
          displayContent = parsed.text || parsed.content || parsed.summary || parsed.blogPost?.text || displayContent;
        } catch {
          // Use as is
        }
      }
      console.log(displayContent);
      console.log('-'.repeat(80));
      
      // Clean content for word count
      let cleanContent = postContent.summary;
      if (cleanContent.startsWith('{')) {
        try {
          const parsed = JSON.parse(cleanContent);
          cleanContent = parsed.text || parsed.content || parsed.summary || parsed.blogPost?.text || cleanContent;
        } catch {
          // Use as is
        }
      }
      const wordCount = cleanContent.split(/\s+/).filter((w: string) => w.length > 0).length;
      console.log(`\nWord Count: ${wordCount} words\n`);

      // Ask for approval
      const answer = await askQuestion('\n✅ Does this post look correct? Post it to Malama Dental GMB? (yes/no/edit): ');

      if (answer.toLowerCase().trim() === 'yes' || answer.toLowerCase().trim() === 'y') {
        try {
          console.log('\n🚀 Posting to Google Business Profile...');

          // Clean content before posting
          let postSummary = postContent.summary;
          if (postSummary.startsWith('{')) {
            try {
              const parsed = JSON.parse(postSummary);
              postSummary = parsed.text || parsed.content || parsed.summary || parsed.blogPost?.text || postSummary;
            } catch {
              // Use as is
            }
          }

          const response = await createLocalPost({
            accountId,
            locationId: numericLocationId,
            post: {
              languageCode: 'en-US',
              summary: postSummary,
              callToAction: postContent.callToAction,
              topicType: postContent.topicType,
            },
          });

          console.log(`   ✅ Posted successfully! (ID: ${response.name})`);
          console.log(`   State: ${response.state}`);
          console.log(`   Created: ${response.createTime}`);
          posted += 1;

          // Delay before next post (except for the last one)
          if (i < result.posts.length - 1) {
            console.log(`\n   ⏳ Moving to next post...\n`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error: any) {
          console.error(`   ❌ Failed to post: ${error.message}`);
          errors += 1;
        }
      } else if (answer.toLowerCase().trim() === 'edit') {
        console.log('\n💡 To edit, modify the post content and run again with a custom topic.');
        console.log('   Example: npm run generate-smart-post "Your edited topic"\n');
        skipped += 1;
      } else {
        console.log('\n⏭️  Skipping this post.\n');
        skipped += 1;
      }
    }

    rl.close();

    console.log(`\n\n✅ Post Generation Complete!`);
    console.log(`   Posted: ${posted}/${result.posts.length}`);
    console.log(`   Skipped: ${skipped}`);
    if (errors > 0) {
      console.log(`   Errors: ${errors}`);
    }
    console.log();

    // Suggestions
    if (result.source === 'weekly_report' && result.keywords) {
      console.log('💡 Post generated from weekly keyword trends!');
      console.log(`   These keywords are trending in your area.`);
      if (posted < result.posts.length) {
        console.log(`   Consider generating more posts with the remaining keywords.`);
      }
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
    rl.close();
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
};

main();

