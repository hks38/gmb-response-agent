import dotenv from 'dotenv';
import { prisma } from '../src/db/client';

dotenv.config();

const main = async () => {
  const replyText = process.argv[2];

  if (!replyText) {
    console.log('Usage: npm run update-latest-reply "Your reply text here"');
    console.log('\nOr provide reply text via stdin:');
    console.log('  echo "Your reply" | npm run update-latest-reply');
    process.exit(1);
  }

  console.log('Updating reply for the latest review...\n');

  try {
    // Find the latest review
    const latestReview = await prisma.review.findFirst({
      orderBy: { createTime: 'desc' },
    });

    if (!latestReview) {
      console.log('❌ No reviews found in database.');
      console.log('   Run "npm run fetch-reviews" first to fetch reviews from Google Business Profile.');
      process.exit(1);
    }

    console.log(`Found latest review:`);
    console.log(`  Author: ${latestReview.authorName}`);
    console.log(`  Rating: ${latestReview.rating}⭐`);
    console.log(`  Created: ${latestReview.createTime.toISOString()}`);
    if (latestReview.comment) {
      console.log(`  Comment: ${latestReview.comment.substring(0, 100)}${latestReview.comment.length > 100 ? '...' : ''}`);
    }
    console.log(`  Current reply: ${latestReview.replyDraft || '(none)'}\n`);

    // Update the reply
    const updated = await prisma.review.update({
      where: { id: latestReview.id },
      data: { replyDraft: replyText },
    });

    console.log('✅ Reply updated successfully!');
    console.log(`\nUpdated reply:`);
    console.log(`  ${updated.replyDraft}`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();

