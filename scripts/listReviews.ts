import dotenv from 'dotenv';
import { prisma } from '../src/db/client';

dotenv.config();

const main = async () => {
  try {
    const reviews = await prisma.review.findMany({
      orderBy: { createTime: 'desc' },
      take: 10,
    });

    if (reviews.length === 0) {
      console.log('No reviews found in database.');
      process.exit(0);
    }

    console.log(`\n📋 Found ${reviews.length} review(s) (showing latest 10):\n`);

    reviews.forEach((review, index) => {
      console.log(`${index + 1}. ${review.authorName} - ${review.rating}⭐`);
      console.log(`   Created: ${review.createTime.toISOString()}`);
      console.log(`   Status: ${review.status}`);
      console.log(`   Sentiment: ${review.sentiment || 'N/A'}`);
      if (review.comment) {
        const commentPreview = review.comment.length > 80 
          ? review.comment.substring(0, 80) + '...' 
          : review.comment;
        console.log(`   Comment: ${commentPreview}`);
      }
      if (review.replyDraft) {
        const replyPreview = review.replyDraft.length > 80 
          ? review.replyDraft.substring(0, 80) + '...' 
          : review.replyDraft;
        console.log(`   Reply: ${replyPreview}`);
      }
      console.log(`   ID: ${review.id}`);
      console.log();
    });

    const latest = reviews[0];
    console.log(`\n✅ Latest review: ID ${latest.id} by ${latest.authorName}`);
    console.log(`   Full reply draft: ${latest.replyDraft || '(no reply draft)'}`);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();

