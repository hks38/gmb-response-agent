import { llmService } from './llmService';
import { getWebsiteContext } from './websiteContext';
import { getBusinessConfig } from './businessConfig';
import { generatePostImage } from './imageGenerator';
import { getBusinessSettings } from './settingsService';
import { getDefaultBusinessId } from './tenantDefaults';

export interface SEOPostInput {
  topic?: string;
  targetKeywords?: string[];
  postType?: 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT';
  callToAction?: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL';
  ctaUrl?: string;
  businessId?: string;
}

export interface SEOPostContent {
  summary: string; // Main post text (max 1500 chars for GMB)
  callToAction?: {
    actionType: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL';
    url?: string;
  };
  topicType: 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT';
}

const LOCAL_SEO_KEYWORDS = [
  'Long Valley dentist',
  'family dentist Long Valley',
  'dental care Long Valley',
  'gentle dental care',
  'Long Valley dental practice',
  'dentist near me',
  'family dentistry',
  'dental cleaning Long Valley',
];

/**
 * Generate SEO-optimized post content for Google Business Profile
 * Uses enhanced 3-layer system: Prompt Engineering → Generation → Verification
 */
export const generateSEOPost = async (input: SEOPostInput): Promise<SEOPostContent> => {
  const businessId = input.businessId || (await getDefaultBusinessId());
  const businessConfig = await getBusinessConfig(businessId);
  const settings = await getBusinessSettings(businessId);
  const practiceInfo = await getWebsiteContext();
  
  const topic = input.topic || `General dental care and practice update for ${businessConfig.name}`;
  const keywords = input.targetKeywords || LOCAL_SEO_KEYWORDS;
  
  // Use enhanced content generator with 3-layer system
  const { generateEnhancedContent } = await import('./enhancedContentGenerator');
  
  const result = await generateEnhancedContent({
    task: 'seo_post',
    keywords: keywords,
    topic: topic,
    maxWords: settings.gmbPostMaxWords, // settings-driven word limit
    tone: 'warm, friendly, professional',
    style: 'concise and engaging',
    additionalContext: `
Business Name: ${businessConfig.name}
Location: ${businessConfig.location}
Website: ${businessConfig.websiteUrl}
${practiceInfo ? `
Services: ${practiceInfo.services.join(', ')}
Unique Selling Points: ${practiceInfo.unique_selling_points.join(', ')}
` : ''}
`,
  });

  // Generate image for the post
  let imagePath: string | undefined;
  try {
    console.log('🎨 Generating image for post...');
    const generatedImage = await generatePostImage({
      topic: topic,
      keywords: keywords,
      businessName: businessConfig.name,
    });
    imagePath = generatedImage.imagePath;
    console.log(`   ✓ Image generated: ${imagePath}`);
  } catch (imageError: any) {
    console.warn(`   ⚠️  Image generation failed: ${imageError.message}`);
    // Continue without image - post will still be created
  }

  // Format as SEOPostContent
  const postContent: SEOPostContent = {
    summary: result.content,
    callToAction: {
      actionType: (input.callToAction || 'LEARN_MORE') as any,
      url: input.ctaUrl || businessConfig.websiteUrl,
    },
    topicType: (input.postType || 'STANDARD') as any,
  };

  // Add image metadata if available
  // Note: GMB API needs image as a publicly accessible URL
  // TODO: Upload image to Google Cloud Storage or similar and get public URL
  if (imagePath) {
    // Store image path for later upload/processing
    (postContent as any).imagePath = imagePath;
  }

  return postContent;
};

/**
 * Generate multiple SEO posts for different topics
 */
export const generateMultipleSEOPosts = async (
  topics: string[],
  options?: SEOPostInput
): Promise<SEOPostContent[]> => {
  const posts: SEOPostContent[] = [];

  for (const topic of topics) {
    try {
      const post = await generateSEOPost({
        ...options,
        topic,
      });
      posts.push(post);
      
      // Add delay between generations to avoid rate limits
      if (topics.indexOf(topic) < topics.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    } catch (error: any) {
      console.error(`Failed to generate post for topic "${topic}": ${error.message}`);
      // Continue with other topics
    }
  }

  return posts;
};

