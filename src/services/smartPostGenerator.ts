import { prisma } from '../db/client';
import { generateSEOPost, SEOPostInput, SEOPostContent } from './seoPostGenerator';
import { getBusinessConfig } from './businessConfig';

export interface PostGenerationOptions {
  topic?: string;
  postType?: 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT';
  callToAction?: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL';
  ctaUrl?: string;
  useWeeklyReport?: boolean; // If true, uses weekly report data
  location?: string; // Specific location to target
  maxPosts?: number; // Maximum number of posts to generate (default: 1)
  businessId?: string;
}

export interface PostGenerationResult {
  posts: SEOPostContent[];
  source: 'weekly_report' | 'custom_topic';
  keywords?: string[];
  reportDate?: Date;
}

/**
 * Smart post generator that uses weekly keyword report when available,
 * falls back to custom topic if no report exists
 */
export const generateSmartPost = async (
  options: PostGenerationOptions
): Promise<PostGenerationResult> => {
  const {
    topic,
    postType = 'STANDARD',
    callToAction = 'LEARN_MORE',
    ctaUrl,
    useWeeklyReport = true,
    location,
    maxPosts = 1,
    businessId,
  } = options;

  // Try to get weekly report if enabled
  if (useWeeklyReport) {
    const report = await getLatestWeeklyReport({ location, businessId });
    
    if (report) {
      console.log(`📊 Using weekly keyword report from ${report.reportDate.toISOString().split('T')[0]}`);
      return await generatePostsFromReport(report, {
        postType,
        callToAction,
        ctaUrl,
        maxPosts,
      });
    } else {
      console.log('⚠️  No weekly report found, using fallback topic');
    }
  }

  // Fallback: use custom topic or default
  const businessConfig = await getBusinessConfig();
  const fallbackTopic = topic || `General dental care and practice information for ${businessConfig.name}`;
  console.log(`📝 Generating post with custom topic: "${fallbackTopic}"`);

  const post = await generateSEOPost({
    topic: fallbackTopic,
    postType,
    callToAction,
    ctaUrl: ctaUrl || businessConfig.websiteUrl,
    businessId,
  });

  return {
    posts: [post],
    source: 'custom_topic',
  };
};

/**
 * Get the latest weekly keyword report
 */
const getLatestWeeklyReport = async (opts?: { location?: string; businessId?: string }) => {
  const location = opts?.location;
  const businessId = opts?.businessId;
  // First try consolidated report if no specific location
  if (!location) {
    const consolidatedReport = await prisma.keywordWeeklyReport.findFirst({
      where: {
        ...(businessId ? { businessId } : {}),
        location: { contains: 'All Locations' },
      },
      orderBy: { reportDate: 'desc' },
    });

    if (consolidatedReport) {
      return consolidatedReport;
    }
  }

  // Try specific location or any location
  const where: any = {};
  if (location) {
    where.location = location;
  }
  if (businessId) {
    where.businessId = businessId;
  }

  const report = await prisma.keywordWeeklyReport.findFirst({
    where,
    orderBy: { reportDate: 'desc' },
  });

  // If still no report found, try getting the most recent report regardless of location
  if (!report) {
    const anyReport = await prisma.keywordWeeklyReport.findFirst({
      ...(businessId ? { where: { businessId } } : {}),
      orderBy: { reportDate: 'desc' },
    });
    return anyReport;
  }

  return report;
};

/**
 * Generate posts based on weekly keyword report
 */
const generatePostsFromReport = async (
  report: any,
  options: {
    postType: 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT';
    callToAction: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL';
    ctaUrl?: string;
    maxPosts: number;
  }
): Promise<PostGenerationResult> => {
  const { postType, callToAction, ctaUrl, maxPosts } = options;

  // Parse report data
  const topKeywords = JSON.parse(report.topKeywords || '[]');
  const trendingUp = JSON.parse(report.trendingUp || '[]');

  // Select keywords to use for posts
  // Prioritize trending keywords, then top keywords
  const keywordsToUse: string[] = [];
  
  // Add trending keywords first (up to 50% of posts)
  const trendingCount = Math.min(Math.ceil(maxPosts / 2), trendingUp.length);
  keywordsToUse.push(...trendingUp.slice(0, trendingCount));

  // Fill remaining with top keywords
  const remaining = maxPosts - keywordsToUse.length;
  if (remaining > 0) {
    const topKeywordsFiltered = topKeywords.filter(
      (kw: string) => !keywordsToUse.includes(kw)
    );
    keywordsToUse.push(...topKeywordsFiltered.slice(0, remaining));
  }

  // If we still don't have enough, use remaining top keywords
  if (keywordsToUse.length < maxPosts && topKeywords.length > keywordsToUse.length) {
    const more = topKeywords
      .filter((kw: string) => !keywordsToUse.includes(kw))
      .slice(0, maxPosts - keywordsToUse.length);
    keywordsToUse.push(...more);
  }

  console.log(`🎯 Generating ${keywordsToUse.length} post(s) using keywords: ${keywordsToUse.join(', ')}`);

  // Generate posts for each keyword
  const posts: SEOPostContent[] = [];
  
  for (let i = 0; i < keywordsToUse.length; i++) {
    const keyword = keywordsToUse[i];
    
    try {
      // Create a natural topic from the keyword
      const topic = createTopicFromKeyword(keyword, report.location);
      
      const post = await generateSEOPost({
        topic,
        postType,
        callToAction,
        ctaUrl,
      });

      posts.push(post);

      // Rate limiting between posts
      if (i < keywordsToUse.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error: any) {
      console.error(`⚠️  Failed to generate post for keyword "${keyword}": ${error.message}`);
      // Continue with next keyword
    }
  }

  return {
    posts,
    source: 'weekly_report',
    keywords: keywordsToUse,
    reportDate: report.reportDate,
  };
};

/**
 * Create a natural topic/description from a keyword
 */
const createTopicFromKeyword = (keyword: string, location?: string): string => {
  // Get business name dynamically
  const businessName = process.env.BUSINESS_NAME || 'Malama Dental';
  
  // Remove location suffix if present (we'll add it naturally in the post)
  let baseKeyword = keyword;
  const locationPatterns = [
    /,\s*(Long Valley|Hackettstown|Califon|Tewksbury|Flanders|Budd Lake|Chester|Mendham|Peapack and Gladstone),\s*NJ/i,
  ];
  
  for (const pattern of locationPatterns) {
    baseKeyword = baseKeyword.replace(pattern, '').trim();
  }

  // Create natural topic descriptions
  const topicMap: Record<string, string> = {
    'dentist near me': `Finding quality dental care at ${businessName} in your area`,
    'dental cleaning': `Professional dental cleaning services at ${businessName}`,
    'teeth whitening': `Professional teeth whitening treatments at ${businessName}`,
    'pediatric dentist': `Pediatric dental care for children at ${businessName}`,
    'cosmetic dentist': `Cosmetic dentistry services at ${businessName}`,
    'emergency dentist': `Emergency dental care at ${businessName} when you need it most`,
    'dental implants': `Dental implants for permanent tooth replacement at ${businessName}`,
    'teeth cleaning': `Teeth cleaning and preventive care at ${businessName}`,
    'family dentist': `Family-friendly dental care for all ages at ${businessName}`,
    'dental exam': `Comprehensive dental examinations at ${businessName}`,
    'root canal': `Root canal treatment to save your tooth at ${businessName}`,
    'crowns': `Dental crowns for tooth restoration at ${businessName}`,
    'fillings': `Tooth-colored fillings at ${businessName}`,
    'veneers': `Dental veneers for a perfect smile at ${businessName}`,
    'invisalign': `Invisalign clear aligners for straight teeth at ${businessName}`,
    'braces': `Orthodontic braces for teeth straightening at ${businessName}`,
    'gum disease treatment': `Gum disease treatment and prevention at ${businessName}`,
    'tooth extraction': `Tooth extraction services at ${businessName}`,
    'wisdom teeth removal': `Wisdom teeth removal at ${businessName}`,
    'oral surgery': `Oral surgery procedures at ${businessName}`,
    'dental bonding': `Dental bonding for smile enhancement at ${businessName}`,
    'deep cleaning': `Deep dental cleaning for gum health at ${businessName}`,
  };

  // Check for exact match
  const lowerKeyword = baseKeyword.toLowerCase();
  if (topicMap[lowerKeyword]) {
    return topicMap[lowerKeyword];
  }

  // Check for partial matches
  for (const [key, topic] of Object.entries(topicMap)) {
    if (lowerKeyword.includes(key) || key.includes(lowerKeyword)) {
      return topic;
    }
  }

  // Default: create topic from keyword with business name
  return `${baseKeyword} services at ${businessName}`;
};

