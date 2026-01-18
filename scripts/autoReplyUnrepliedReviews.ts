import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { analyzeReview } from '../src/services/analysisService';
import { postReplyToReview } from '../src/services/postReply';
import { getAccessToken } from '../src/services/googleAuth';

dotenv.config();

const main = async () => {
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  console.log('\n📧 Auto-Reply to Unreplied Reviews (Last 6 Months)\n');
  console.log('='.repeat(80));

  try {
    // Calculate date 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    console.log(`📅 Finding unreplied reviews from the last 6 months...`);
    console.log(`   From: ${sixMonthsAgo.toISOString().split('T')[0]}`);
    console.log(`   To: ${new Date().toISOString().split('T')[0]}\n`);

    // Find unreplied reviews from last 6 months
    const unrepliedReviews = await prisma.review.findMany({
      where: {
        createTime: {
          gte: sixMonthsAgo,
        },
        repliedAt: null, // Not replied yet
      },
      orderBy: {
        createTime: 'desc',
      },
    });

    console.log(`📊 Found ${unrepliedReviews.length} unreplied review(s) from last 6 months\n`);

    if (unrepliedReviews.length === 0) {
      console.log('✅ No unreplied reviews found. All caught up!\n');
      return;
    }

    // Display summary
    console.log('📋 Reviews to Reply:');
    console.log('-'.repeat(80));
    unrepliedReviews.forEach((review, index) => {
      const date = review.createTime.toISOString().split('T')[0];
      console.log(`${index + 1}. ${review.authorName} - ${review.rating}⭐ (${date})`);
      if (review.comment) {
        const preview = review.comment.substring(0, 60);
        console.log(`   "${preview}${review.comment.length > 60 ? '...' : ''}"`);
      }
    });
    console.log('-'.repeat(80));
    console.log();

    // Process each review
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < unrepliedReviews.length; i++) {
      const review = unrepliedReviews[i];
      const reviewNum = i + 1;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📄 Processing Review ${reviewNum}/${unrepliedReviews.length}`);
      console.log('='.repeat(80));
      console.log(`   Author: ${review.authorName}`);
      console.log(`   Rating: ${review.rating}/5`);
      console.log(`   Date: ${review.createTime.toISOString().split('T')[0]}`);
      if (review.comment) {
        console.log(`   Comment: ${review.comment.substring(0, 100)}${review.comment.length > 100 ? '...' : ''}`);
      } else {
        console.log(`   Comment: (no comment)`);
      }
      console.log();

      try {
        // Step 1: Analyze review and generate reply (or use existing reply draft if available)
        let replyDraft = review.replyDraft;

        if (!replyDraft || review.lastAnalyzedAt === null) {
          console.log('🔧 Analyzing review and generating reply...');
          const analysis = await analyzeReview({
            authorName: review.authorName,
            rating: review.rating,
            comment: review.comment,
            createTime: review.createTime.toISOString(),
          });

          replyDraft = analysis.reply_draft || '';

          // Update review with analysis
          await prisma.review.update({
            where: { id: review.id },
            data: {
              sentiment: analysis.sentiment,
              urgency: analysis.urgency,
              topics: analysis.topics ? JSON.stringify(analysis.topics) : null,
              suggestedActions: analysis.suggested_actions ? JSON.stringify(analysis.suggested_actions) : null,
              riskFlags: analysis.risk_flags ? JSON.stringify(analysis.risk_flags) : null,
              replyDraft: replyDraft,
              status: analysis.risk_flags?.includes('HIPAA risk') || review.rating <= 3 || analysis.sentiment === 'negative'
                ? 'Needs Approval'
                : 'Auto-Approved',
              lastAnalyzedAt: new Date(),
            },
          });

          console.log(`   ✓ Analysis complete`);
          console.log(`   ✓ Reply draft generated (${replyDraft.split(/\s+/).length} words)`);
          console.log(`   ✓ Status: ${analysis.risk_flags?.includes('HIPAA risk') || review.rating <= 3 || analysis.sentiment === 'negative' ? 'Needs Approval' : 'Auto-Approved'}`);
        } else {
          console.log(`   ✓ Using existing reply draft (${replyDraft.split(/\s+/).length} words)`);
        }

        // Check if needs approval
        if (review.status === 'Needs Approval') {
          console.log(`\n   ⚠️  Review requires approval before posting`);
          console.log(`   ⏭️  Skipping this review (status: Needs Approval)`);
          skippedCount++;
          continue;
        }

        // Display reply draft
        console.log(`\n   📝 Reply Draft:`);
        console.log(`   ${'-'.repeat(76)}`);
        const words = replyDraft.split(' ');
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
        console.log(`   ${'-'.repeat(76)}`);
        console.log();

        // Step 2: Post reply to Google Business Profile
        console.log('🚀 Posting reply to Google Business Profile...');
        const numericLocationId = locationId.startsWith('locations/')
          ? locationId.split('/')[1]
          : locationId;

        const accountIdClean = accountId.replace(/^accounts\//, '');

        await postReplyToReview({
          accountId: accountIdClean,
          locationId: numericLocationId,
          reviewId: review.reviewId,
          replyText: replyDraft,
        });

        // Step 3: Update review in database
        await prisma.review.update({
          where: { id: review.id },
          data: {
            repliedAt: new Date(),
            status: 'Replied',
          },
        });

        console.log(`   ✅ Reply posted successfully!`);
        successCount++;

        // Delay between replies to avoid rate limits
        if (i < unrepliedReviews.length - 1) {
          console.log(`   ⏳ Waiting 5 seconds before next review...\n`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

      } catch (error: any) {
        console.error(`   ❌ Failed to process review: ${error.message}`);
        failCount++;

        // Continue with next review even if this one fails
        if (i < unrepliedReviews.length - 1) {
          console.log(`   ⏳ Waiting 5 seconds before next review...\n`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    // Final summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ AUTO-REPLY COMPLETE');
    console.log('='.repeat(80));
    console.log(`   Total Reviews: ${unrepliedReviews.length}`);
    console.log(`   ✅ Successfully Replied: ${successCount}`);
    console.log(`   ⏭️  Skipped (Needs Approval): ${skippedCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log();

    if (successCount > 0) {
      console.log('💡 Successfully replied reviews will appear on your Google Business Profile shortly.');
    }

    if (skippedCount > 0) {
      console.log(`💡 ${skippedCount} review(s) require manual approval before posting.`);
      console.log('   Review them in the admin UI and approve individually.');
    }

    if (failCount > 0) {
      console.log(`⚠️  ${failCount} review(s) failed to post. Check the error messages above.`);
    }

    console.log();

  } catch (error: any) {
    console.error('\n❌ Error processing reviews:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check that GOOGLE_ACCOUNT_ID and GOOGLE_LOCATION_ID are set correctly');
    console.error('   2. Verify your OAuth token has proper permissions (business.manage scope)');
    console.error('   3. Ensure the Google Business Profile API is enabled');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();


