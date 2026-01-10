import dotenv from 'dotenv';
import { getWebsiteContext } from '../src/services/websiteContext';

dotenv.config();

const main = async () => {
  const websiteUrl = process.env.WEBSITE_URL || 'https://malama.dental';
  console.log(`Fetching website context from ${websiteUrl}...`);

  try {
    const practiceInfo = await getWebsiteContext(websiteUrl);

    console.log('\n✓ Website context fetched and cached:');
    console.log(`  Practice: ${practiceInfo.practice_name}`);
    console.log(`  Location: ${practiceInfo.location}`);
    console.log(`  Phone: ${practiceInfo.phone || 'N/A'}`);
    console.log(`  Email: ${practiceInfo.email || 'N/A'}`);
    console.log(`  Services: ${practiceInfo.services.length} found`);
    if (practiceInfo.services.length > 0) {
      console.log(`    - ${practiceInfo.services.slice(0, 5).join('\n    - ')}${practiceInfo.services.length > 5 ? '...' : ''}`);
    }
    console.log(`  USPs: ${practiceInfo.unique_selling_points.length} found`);
    if (practiceInfo.unique_selling_points.length > 0) {
      console.log(`    - ${practiceInfo.unique_selling_points.join(', ')}`);
    }

    console.log('\n✓ Context will be used in review analysis prompts.');
  } catch (error) {
    console.error('✗ Error fetching website context:', error);
    process.exit(1);
  }
};

main();

