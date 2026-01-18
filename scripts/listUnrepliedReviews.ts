import dotenv from 'dotenv';
import { prisma } from '../src/db/client';

dotenv.config();

const main = async () => {
  try {
    // Find reviews that haven't been replied to
    // Status is not "Replied" and has a reply draft
    const unrepliedReviews = await prisma.review.findMany({
      where: {
        status: {
          not: 'Replied',
        },
        replyDraft: {
          not: null,
        },
      },
      orderBy: { createTime: 'desc' },
    });

    // Also find reviews without reply drafts
    const reviewsWithoutDrafts = await prisma.review.findMany({
      where: {
        replyDraft: null,
      },
      orderBy: { createTime: 'desc' },
    });

    const allUnreplied = await prisma.review.findMany({
      where: {
        status: {
          not: 'Replied',
        },
      },
      orderBy: { createTime: 'desc' },
    });

    console.log(`\n📋 Unreplied Reviews Summary:`);
    console.log(`   Total unreplied: ${allUnreplied.length}`);
    console.log(`   With reply drafts ready: ${unrepliedReviews.length}`);
    console.log(`   Without reply drafts: ${reviewsWithoutDrafts.length}`);
    console.log();

    if (unrepliedReviews.length === 0 && reviewsWithoutDrafts.length === 0) {
      console.log('✅ All reviews have been replied to!');
      process.exit(0);
    }

    if (unrepliedReviews.length > 0) {
      console.log(`\n📝 Reviews Ready to Reply (have reply drafts):\n`);
      unrepliedReviews.forEach((review, index) => {
        console.log(`${index + 1}. ${review.authorName} - ${review.rating}⭐`);
        console.log(`   Created: ${review.createTime.toISOString().split('T')[0]}`);
        console.log(`   Status: ${review.status}`);
        console.log(`   Sentiment: ${review.sentiment || 'N/A'}`);
        if (review.comment) {
          const commentPreview = review.comment.length > 100 
            ? review.comment.substring(0, 100) + '...' 
            : review.comment;
          console.log(`   Comment: ${commentPreview}`);
        }
        if (review.replyDraft) {
          const replyPreview = review.replyDraft.length > 100 
            ? review.replyDraft.substring(0, 100) + '...' 
            : review.replyDraft;
          console.log(`   Reply: ${replyPreview}`);
        }
        console.log(`   ID: ${review.id}`);
        console.log(`   💡 To reply: npm run post-reply ${review.id}`);
        console.log();
      });
    }

    if (reviewsWithoutDrafts.length > 0) {
      console.log(`\n⚠️  Reviews Without Reply Drafts (need analysis):\n`);
      reviewsWithoutDrafts.forEach((review, index) => {
        console.log(`${index + 1}. ${review.authorName} - ${review.rating}⭐`);
        console.log(`   Created: ${review.createTime.toISOString().split('T')[0]}`);
        console.log(`   Status: ${review.status}`);
        console.log(`   Sentiment: ${review.sentiment || 'N/A'}`);
        if (review.comment) {
          const commentPreview = review.comment.length > 100 
            ? review.comment.substring(0, 100) + '...' 
            : review.comment;
          console.log(`   Comment: ${commentPreview}`);
        }
        console.log(`   ID: ${review.id}`);
        console.log(`   💡 To generate reply: npm run fetch-reviews`);
        console.log();
      });
    }

    console.log(`\n💡 Commands:`);
    console.log(`   - Reply to latest: npm run post-reply`);
    console.log(`   - Reply to specific: npm run post-reply <review-id>`);
    console.log(`   - Generate replies: npm run fetch-reviews`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();


