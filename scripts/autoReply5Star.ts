import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { analyzeReview } from '../src/services/analysisService';
import { postReplyToReview } from '../src/services/postReply';
import { ReviewAnalysis } from '../src/types';

dotenv.config();

const normalizeRating = (rating: unknown): number => {
  if (typeof rating === 'number') return rating;
  if (typeof rating === 'string') {
    const map: Record<string, number> = {
      ONE: 1,
      TWO: 2,
      THREE: 3,
      FOUR: 4,
      FIVE: 5,
    };
    return map[rating] || Number(rating) || 0;
  }
  return 0;
};

const needsApproval = (analysis: ReviewAnalysis, rating: number): boolean => {
  const hasHipaaRisk = (analysis.risk_flags || []).some((flag) =>
    flag.toLowerCase().includes('hipaa')
  );
  const isNegative = analysis.sentiment === 'negative';
  const lowRating = rating <= 3;
  return hasHipaaRisk || isNegative || lowRating;
};

const main = async () => {
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  // Calculate date 8 months ago
  const eightMonthsAgo = new Date();
  eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);

  console.log(`\n🎯 Auto-replying to 5-star reviews from the last 8 months...`);
  console.log(`   Date cutoff: ${eightMonthsAgo.toISOString().split('T')[0]}\n`);

  // Find all 5-star reviews from last 8 months that haven't been replied to
  const eligibleReviews = await prisma.review.findMany({
    where: {
      rating: 5,
      createTime: {
        gte: eightMonthsAgo,
      },
      status: {
        not: 'Replied',
      },
    },
    orderBy: { createTime: 'desc' },
  });

  console.log(`📋 Found ${eligibleReviews.length} eligible 5-star reviews from last 8 months\n`);

  if (eligibleReviews.length === 0) {
    console.log('✅ No reviews to reply to!');
    process.exit(0);
  }

  let processed = 0;
  let replied = 0;
  let skipped = 0;
  let errors = 0;

  const numericLocationId = locationId.startsWith('locations/')
    ? locationId.split('/')[1]
    : locationId;

  for (const review of eligibleReviews) {
    try {
      console.log(`\n📝 Processing: ${review.authorName} (ID: ${review.id})`);
      console.log(`   Rating: ${review.rating}⭐`);
      console.log(`   Created: ${review.createTime.toISOString().split('T')[0]}`);
      if (review.comment) {
        const commentPreview = review.comment.length > 80 
          ? review.comment.substring(0, 80) + '...' 
          : review.comment;
        console.log(`   Comment: ${commentPreview}`);
      }

      // Check if review has a reply draft
      let replyDraft = review.replyDraft;
      
      if (!replyDraft) {
        console.log(`   ⚠️  No reply draft found. Generating one...`);
        try {
          const analysis = await analyzeReview({
            authorName: review.authorName,
            rating: review.rating,
            comment: review.comment,
            createTime: review.createTime.toISOString(),
          });

          replyDraft = analysis.reply_draft;
          
          // Update review with analysis
          const status = needsApproval(analysis, review.rating) ? 'Needs Approval' : 'Auto-Approved';
          
          await prisma.review.update({
            where: { id: review.id },
            data: {
              sentiment: analysis.sentiment,
              urgency: analysis.urgency,
              topics: JSON.stringify(analysis.topics || []),
              suggestedActions: JSON.stringify(analysis.suggested_actions || []),
              riskFlags: JSON.stringify(analysis.risk_flags || []),
              replyDraft: replyDraft,
              status,
              lastAnalyzedAt: new Date(),
            },
          });

          console.log(`   ✅ Reply draft generated`);
        } catch (analysisError: any) {
          console.error(`   ❌ Failed to generate reply draft: ${analysisError.message}`);
          errors += 1;
          continue;
        }
      }

      if (!replyDraft) {
        console.log(`   ⚠️  Skipping - no reply draft available`);
        skipped += 1;
        continue;
      }

      // Only auto-reply if status is "Auto-Approved" (not "Needs Approval")
      if (review.status === 'Needs Approval') {
        console.log(`   ⚠️  Skipping - status is "Needs Approval" (requires manual review)`);
        skipped += 1;
        continue;
      }

      console.log(`   💬 Reply: ${replyDraft.substring(0, 100)}${replyDraft.length > 100 ? '...' : ''}`);

      // Post the reply
      try {
        await postReplyToReview({
          accountId,
          locationId: numericLocationId,
          reviewId: review.reviewId,
          replyText: replyDraft,
        });

        // Update status to "Replied"
        await prisma.review.update({
          where: { id: review.id },
          data: { status: 'Replied' },
        });

        console.log(`   ✅ Reply posted successfully!`);
        replied += 1;
      } catch (postError: any) {
        if (postError.message.includes('already exists')) {
          console.log(`   ⚠️  Reply already exists for this review`);
          await prisma.review.update({
            where: { id: review.id },
            data: { status: 'Replied' },
          });
          replied += 1;
        } else {
          console.error(`   ❌ Failed to post reply: ${postError.message}`);
          errors += 1;
        }
      }

      processed += 1;
      
      // Add a small delay to avoid rate limits
      if (processed < eligibleReviews.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    } catch (error: any) {
      console.error(`   ❌ Error processing review ${review.id}: ${error.message}`);
      errors += 1;
    }
  }

  console.log(`\n\n✅ Auto-reply complete!`);
  console.log(`   Processed: ${processed}/${eligibleReviews.length}`);
  console.log(`   Replied: ${replied}`);
  console.log(`   Skipped: ${skipped}`);
  if (errors > 0) {
    console.log(`   Errors: ${errors}`);
  }
  console.log();
};

main()
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

