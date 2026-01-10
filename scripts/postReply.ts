import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { postReplyToReview } from '../src/services/postReply';

dotenv.config();

const main = async () => {
  const reviewId = process.argv[2]; // Optional: specific review ID
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  try {
    let review;

    if (reviewId) {
      // Post reply to specific review by ID
      review = await prisma.review.findUnique({
        where: { id: Number(reviewId) },
      });
      if (!review) {
        console.error(`❌ Review with ID ${reviewId} not found`);
        process.exit(1);
      }
    } else {
      // Post reply to latest review
      review = await prisma.review.findFirst({
        where: {
          replyDraft: { not: null },
        },
        orderBy: { createTime: 'desc' },
      });

      if (!review) {
        console.error('❌ No review with a reply draft found');
        console.log('\n💡 To generate replies, run: npm run fetch-reviews');
        process.exit(1);
      }
    }

    if (!review.replyDraft) {
      console.error(`❌ Review ${review.id} by ${review.authorName} has no reply draft`);
      console.log('\n💡 To generate a reply, run: npm run fetch-reviews');
      process.exit(1);
    }

    console.log(`📝 Review Details:`);
    console.log(`   Author: ${review.authorName}`);
    console.log(`   Rating: ${review.rating}⭐`);
    console.log(`   Review ID (Google): ${review.reviewId}`);
    console.log(`   Comment: ${review.comment?.substring(0, 100) || '(no comment)'}${review.comment && review.comment.length > 100 ? '...' : ''}`);
    console.log(`\n💬 Reply to post:`);
    console.log(`   ${review.replyDraft}`);
    console.log();

    // Extract numeric location ID from "locations/123456" format
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;

    // Post the reply
    await postReplyToReview({
      accountId,
      locationId: numericLocationId,
      reviewId: review.reviewId,
      replyText: review.replyDraft,
    });

    // Update review status to indicate reply was posted
    await prisma.review.update({
      where: { id: review.id },
      data: {
        status: 'Replied',
      },
    });

    console.log(`\n✅ Successfully posted reply to review by ${review.authorName}!`);
    console.log(`   Review ID: ${review.id}`);
    console.log(`   Status updated to: Replied`);
  } catch (error: any) {
    console.error('\n❌ Error posting reply:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();

