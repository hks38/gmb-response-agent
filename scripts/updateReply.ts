import dotenv from 'dotenv';
import { prisma } from '../src/db/client';

dotenv.config();

const main = async () => {
  const authorName = process.argv[2] || 'Shail Raval';
  const replyText = process.argv[3] || 'Thanks for your review';

  console.log(`Updating reply for review by: ${authorName}`);
  console.log(`Reply: ${replyText}\n`);

  try {
    // Find the review (case-insensitive search)
    const allReviews = await prisma.review.findMany();
    const review = allReviews.find((r) =>
      r.authorName.toLowerCase().includes(authorName.toLowerCase())
    );

    if (!review) {
      console.log(`No review found for author: ${authorName}`);
      console.log('\nAvailable reviews:');
      const reviews = await prisma.review.findMany({
        take: 10,
        select: { id: true, authorName: true, rating: true, createTime: true },
        orderBy: { createTime: 'desc' },
      });
      reviews.forEach((r) => {
        console.log(`  - ${r.authorName} (ID: ${r.id}, Rating: ${r.rating})`);
      });
      process.exit(1);
    }

    console.log(`Found review: ID ${review.id}, Rating: ${review.rating}`);
    console.log(`Current reply: ${review.replyDraft || '(none)'}\n`);

    // Update the reply
    const updated = await prisma.review.update({
      where: { id: review.id },
      data: { replyDraft: replyText },
    });

    console.log(`✓ Reply updated successfully!`);
    console.log(`\nUpdated review:`);
    console.log(`  Author: ${updated.authorName}`);
    console.log(`  Rating: ${updated.rating}`);
    console.log(`  Reply: ${updated.replyDraft}`);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();

