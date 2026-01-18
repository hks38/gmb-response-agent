import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { listLocalPosts } from '../src/services/googlePosts';

dotenv.config();

const main = async () => {
  const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
  const locationId = process.env.GOOGLE_LOCATION_ID || '';

  if (!accountId || !locationId) {
    console.error('❌ Error: Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in .env');
    process.exit(1);
  }

  console.log('\n📋 Listing Google Business Profile Posts\n');

  try {
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;

    const posts = await listLocalPosts({
      accountId,
      locationId: numericLocationId,
    });

    if (posts.length === 0) {
      console.log('No posts found.');
      process.exit(0);
    }

    console.log(`Found ${posts.length} post(s):\n`);

    posts.forEach((post, index) => {
      console.log(`${index + 1}. Post ID: ${post.name}`);
      console.log(`   State: ${post.state}`);
      console.log(`   Created: ${post.createTime}`);
      console.log(`   Updated: ${post.updateTime}`);
      console.log(`   Summary: ${post.summary.substring(0, 150)}${post.summary.length > 150 ? '...' : ''}`);
      console.log();
    });
  } catch (error: any) {
    console.error('❌ Error listing posts:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();


