import * as readline from 'readline';
import { createLocalPost } from './googlePosts';
import { generateSmartPost, PostGenerationOptions } from './smartPostGenerator';

export interface PostWithConfirmationOptions extends PostGenerationOptions {
  accountId: string;
  locationId: string;
}

export interface PostConfirmationResult {
  posted: boolean;
  postId?: string;
  postContent?: string;
  userConfirmed: boolean;
}

/**
 * Generate post and ask for user confirmation before posting
 */
export const generatePostWithConfirmation = async (
  options: PostWithConfirmationOptions
): Promise<PostConfirmationResult> => {
  const { accountId, locationId, ...generationOptions } = options;

  console.log('\n🎯 Generating GMB Post (Preview Mode)\n');

  try {
    // Generate the post content
    const result = await generateSmartPost(generationOptions);

    if (result.posts.length === 0) {
      throw new Error('No posts generated');
    }

    const postContent = result.posts[0];
    
    // Display the post preview
    console.log('\n' + '='.repeat(80));
    console.log('📄 POST PREVIEW');
    console.log('='.repeat(80));
    console.log('\n📝 Post Content:');
    console.log(postContent.summary);
    console.log('\n📊 Details:');
    console.log(`   Type: ${postContent.topicType}`);
    console.log(`   Call-to-Action: ${postContent.callToAction?.actionType || 'None'}`);
    if (postContent.callToAction?.url) {
      console.log(`   CTA URL: ${postContent.callToAction.url}`);
    }
    if (result.keywords && result.keywords.length > 0) {
      console.log(`   Keywords: ${result.keywords.join(', ')}`);
    }
    if (result.source === 'weekly_report') {
      console.log(`   Source: Weekly Keyword Report`);
      if (result.reportDate) {
        console.log(`   Report Date: ${result.reportDate.toISOString().split('T')[0]}`);
      }
    }
    console.log('\n' + '='.repeat(80));

    // Ask for confirmation
    const confirmed = await askForConfirmation('\n❓ Does this post look correct? Post to Google Business Profile? (yes/no): ');

    if (!confirmed) {
      console.log('\n❌ Post generation cancelled by user.');
      return {
        posted: false,
        postContent: postContent.summary,
        userConfirmed: false,
      };
    }

    // Post to GMB
    console.log('\n🚀 Posting to Google Business Profile...');
    
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;

    const response = await createLocalPost({
      accountId,
      locationId: numericLocationId,
      post: {
        languageCode: 'en-US',
        summary: postContent.summary,
        callToAction: postContent.callToAction,
        topicType: postContent.topicType,
      },
    });

    console.log('\n✅ Post created successfully!');
    console.log(`   Post ID: ${response.name}`);
    console.log(`   State: ${response.state}`);
    console.log(`   Created: ${response.createTime}`);

    return {
      posted: true,
      postId: response.name,
      postContent: postContent.summary,
      userConfirmed: true,
    };

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    throw error;
  }
};

/**
 * Ask user for confirmation (yes/no)
 */
const askForConfirmation = (question: string): Promise<boolean> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'yes' || normalized === 'y');
    });
  });
};

