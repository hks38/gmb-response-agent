import axios from 'axios';
import dotenv from 'dotenv';
import { getAccessToken } from './googleAuth';
import { prisma } from '../db/client';
import { llmService } from './llmService';
import { getBusinessConfig } from './businessConfig';
import { getWebsiteContext } from './websiteContext';

dotenv.config();

const BASE_URL_V4 = 'https://mybusiness.googleapis.com/v4';
const BASE_URL_BI = 'https://mybusinessbusinessinformation.googleapis.com/v1';

export interface GMBProfileData {
  locationName?: string;
  primaryCategory?: string;
  categories?: string[];
  address?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  phoneNumber?: string;
  websiteUri?: string;
  regularHours?: any;
  rating?: number;
  totalReviewCount?: number;
  recentReviews?: Array<{
    reviewId: string;
    reviewer: { displayName: string };
    starRating: number;
    comment?: string;
    createTime: string;
  }>;
  posts?: Array<{
    name: string;
    summary: string;
    createTime: string;
    state: string;
  }>;
  insights?: {
    totalViews?: number;
    totalSearches?: number;
    totalMapsViews?: number;
    totalActions?: number;
    totalDirections?: number;
    totalPhoneCalls?: number;
    totalWebsiteClicks?: number;
    averageRating?: number;
    totalReviews?: number;
  };
}

export interface ProfileAnalysisResult {
  overallScore: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  recommendations: Array<{
    category: string;
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    actionItems: string[];
  }>;
  trendAnalysis: string;
  growthOpportunities: string[];
  aiSummary: string;
}

/**
 * Analyze Google My Business Profile and generate AI-powered recommendations
 */
export const analyzeGMBProfile = async (
  accountId: string,
  locationId: string
): Promise<ProfileAnalysisResult> => {
  console.log('📊 Analyzing Google My Business Profile...\n');

  try {
    // Step 1: Fetch profile data
    console.log('1️⃣  Fetching profile data...');
    const profileData = await fetchGMBProfileData(accountId, locationId);
    console.log(`   ✓ Profile data retrieved`);

    // Step 2: Get database metrics
    console.log('2️⃣  Analyzing database metrics...');
    const dbMetrics = await getDatabaseMetrics();
    console.log(`   ✓ Database metrics analyzed`);

    // Step 3: Get current trends
    console.log('3️⃣  Fetching current trends...');
    const trends = await getCurrentTrends();
    console.log(`   ✓ Trends analyzed`);

    // Step 4: Get business context
    console.log('4️⃣  Gathering business context...');
    const businessConfig = await getBusinessConfig();
    const websiteContext = await getWebsiteContext().catch(() => null);
    console.log(`   ✓ Business context gathered`);

    // Step 5: Generate AI analysis
    console.log('5️⃣  Generating AI-powered analysis...');
    const analysis = await generateAIAnalysis({
      profileData,
      dbMetrics,
      trends,
      businessConfig,
      websiteContext,
    });
    console.log(`   ✓ AI analysis generated\n`);

    return analysis;
  } catch (error: any) {
    throw new Error(`Failed to analyze GMB profile: ${error.message}`);
  }
};

/**
 * Fetch comprehensive GMB profile data
 */
const fetchGMBProfileData = async (
  accountId: string,
  locationId: string
): Promise<GMBProfileData> => {
  const client = await buildClient();

  const numericLocationId = locationId.startsWith('locations/')
    ? locationId.split('/')[1]
    : locationId;

  const accountIdClean = accountId.replace(/^accounts\//, '');

  const profileData: GMBProfileData = {};

  try {
    // Fetch location details - try multiple endpoints
    let location: any = null;
    
    // Try Business Information API first
    const locationEndpoint = `${BASE_URL_BI}/accounts/${accountIdClean}/locations/${numericLocationId}`;
    try {
      const locationRes = await client.get(locationEndpoint, {
        params: { readMask: 'name,primaryCategory,categories,storefrontAddress,phoneNumber,websiteUri,regularHours,rating,userReviewCount' },
      });
      location = locationRes.data;
    } catch (biError: any) {
      // Fallback to v4 API
      if (biError.response?.status === 404 || biError.response?.status === 400) {
        try {
          const v4Endpoint = `${BASE_URL_V4}/accounts/${accountIdClean}/locations/${numericLocationId}`;
          const v4Res = await client.get(v4Endpoint);
          location = v4Res.data;
        } catch (v4Error) {
          console.log(`   ⚠️  Could not fetch location details via API`);
          // Use database reviews as fallback for rating/count
        }
      }
    }

    if (location) {
      profileData.locationName = location.name || location.title;
      profileData.primaryCategory = location.primaryCategory?.displayName || location.primaryCategory;
      profileData.categories = location.categories?.map((c: any) => c.displayName || c) || [];
      profileData.address = location.storefrontAddress || location.address;
      profileData.phoneNumber = location.phoneNumber || location.primaryPhone;
      profileData.websiteUri = location.websiteUri || location.website;
      profileData.regularHours = location.regularHours || location.openingHours;
      profileData.rating = location.rating || location.averageRating;
      profileData.totalReviewCount = location.userReviewCount || location.totalReviewCount || location.reviewCount;
    }

    // Fetch recent reviews
    try {
      const reviewsEndpoint = `${BASE_URL_V4}/accounts/${accountIdClean}/locations/${numericLocationId}/reviews`;
      const reviewsRes = await client.get(reviewsEndpoint);
      profileData.recentReviews = reviewsRes.data.reviews?.slice(0, 10) || [];
    } catch (error) {
      // Use database reviews as fallback
      const dbReviews = await prisma.review.findMany({
        orderBy: { createTime: 'desc' },
        take: 10,
      });
      profileData.recentReviews = dbReviews.map(r => ({
        reviewId: r.reviewId,
        reviewer: { displayName: r.authorName },
        starRating: r.rating,
        comment: r.comment || undefined,
        createTime: r.createTime.toISOString(),
      }));
    }

    // Fetch recent posts
    try {
      const postsEndpoint = `${BASE_URL_V4}/accounts/${accountIdClean}/locations/${numericLocationId}/localPosts`;
      const postsRes = await client.get(postsEndpoint);
      profileData.posts = postsRes.data.localPosts?.slice(0, 10) || [];
    } catch (error) {
      // Posts might not be available via API
      console.log(`   ⚠️  Could not fetch posts via API`);
    }

    // Fetch insights (if available)
    try {
      const insightsEndpoint = `${BASE_URL_V4}/accounts/${accountIdClean}/locations/${numericLocationId}/reportInsights`;
      // Note: Insights might require specific date ranges
      // This is a placeholder - actual implementation depends on GMB Insights API
    } catch (error) {
      // Insights might not be available
      console.log(`   ⚠️  Insights not available via API`);
    }

    return profileData;
  } catch (error: any) {
    throw new Error(`Failed to fetch GMB profile data: ${error.message}`);
  }
};

/**
 * Get metrics from database
 */
const getDatabaseMetrics = async () => {
  const totalReviews = await prisma.review.count();
  const averageRating = await prisma.review.aggregate({
    _avg: { rating: true },
  });

  const reviewsByRating = await prisma.review.groupBy({
    by: ['rating'],
    _count: { rating: true },
  });

  const reviewsBySentiment = await prisma.review.groupBy({
    by: ['sentiment'],
    _count: { sentiment: true },
  });

  const repliedReviews = await prisma.review.count({
    where: { repliedAt: { not: null } },
  });

  const pendingAnalysis = await prisma.review.count({
    where: { lastAnalyzedAt: null },
  });

  const recentReviews = await prisma.review.findMany({
    orderBy: { createTime: 'desc' },
    take: 30,
    where: {
      createTime: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
      },
    },
  });

  return {
    totalReviews,
    averageRating: averageRating._avg.rating || 0,
    reviewsByRating: reviewsByRating.reduce((acc, r) => {
      acc[r.rating] = r._count.rating;
      return acc;
    }, {} as Record<number, number>),
    reviewsBySentiment: reviewsBySentiment.reduce((acc, r) => {
      if (r.sentiment) {
        acc[r.sentiment] = (acc[r.sentiment] || 0) + r._count.sentiment;
      }
      return acc;
    }, {} as Record<string, number>),
    repliedReviews,
    replyRate: totalReviews > 0 ? (repliedReviews / totalReviews) * 100 : 0,
    pendingAnalysis,
    recentReviewsCount: recentReviews.length,
    recentAverageRating: recentReviews.length > 0
      ? recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length
      : 0,
  };
};

/**
 * Get current trends from weekly reports
 */
const getCurrentTrends = async () => {
  const latestReport = await prisma.keywordWeeklyReport.findFirst({
    orderBy: { reportDate: 'desc' },
  });

  if (!latestReport) {
    return {
      hasTrendData: false,
      topKeywords: [],
      trendingUp: [],
      summary: null,
    };
  }

  const topKeywords = latestReport.topKeywords
    ? JSON.parse(latestReport.topKeywords)
    : [];
  const trendingUp = latestReport.trendingUp
    ? JSON.parse(latestReport.trendingUp)
    : [];

  return {
    hasTrendData: true,
    reportDate: latestReport.reportDate,
    topKeywords: Array.isArray(topKeywords) ? topKeywords.slice(0, 10) : [],
    trendingUp: Array.isArray(trendingUp) ? trendingUp.slice(0, 10) : [],
    summary: latestReport.summary || null,
    location: latestReport.location,
  };
};

/**
 * Generate AI-powered analysis and recommendations
 */
const generateAIAnalysis = async (data: {
  profileData: GMBProfileData;
  dbMetrics: any;
  trends: any;
  businessConfig: any;
  websiteContext: any;
}): Promise<ProfileAnalysisResult> => {
  const { profileData, dbMetrics, trends, businessConfig, websiteContext } = data;

  const prompt = `You are an expert Google My Business (GMB) growth strategist and marketing analyst specializing in dental practices.

Analyze the following GMB profile data and provide comprehensive recommendations to boost growth.

## Current Profile Status:

**Business Information:**
- Name: ${profileData.locationName || businessConfig.name}
- Primary Category: ${profileData.primaryCategory || 'Not set'}
- Categories: ${profileData.categories?.join(', ') || 'None'}
- Rating: ${profileData.rating?.toFixed(1) || 'N/A'} / 5.0
- Total Reviews: ${profileData.totalReviewCount || 0}

**Review Metrics:**
- Total Reviews in Database: ${dbMetrics.totalReviews}
- Average Rating: ${dbMetrics.averageRating.toFixed(1)} / 5.0
- Recent Reviews (last 90 days): ${dbMetrics.recentReviewsCount}
- Recent Average Rating: ${dbMetrics.recentAverageRating.toFixed(1)} / 5.0
- Reply Rate: ${dbMetrics.replyRate.toFixed(1)}%

**Review Distribution:**
${Object.entries(dbMetrics.reviewsByRating)
  .map(([rating, count]) => `- ${rating} stars: ${count} reviews`)
  .join('\n')}

**Sentiment Analysis:**
${Object.entries(dbMetrics.reviewsBySentiment)
  .map(([sentiment, count]) => `- ${sentiment}: ${count} reviews`)
  .join('\n') || 'No sentiment data available'}

**Posts:**
- Recent Posts: ${profileData.posts?.length || 0}
${profileData.posts && profileData.posts.length > 0
  ? `- Latest Post: ${profileData.posts[0]?.createTime || 'Unknown'}`
  : '- No recent posts'}

**Current Trends** (if available):
${trends.hasTrendData
  ? `- Report Date: ${trends.reportDate.toISOString().split('T')[0]}
- Top Keywords: ${trends.topKeywords.map((k: any) => (typeof k === 'string' ? k : k.keyword || k)).join(', ')}
- Trending Up: ${trends.trendingUp.map((k: any) => (typeof k === 'string' ? k : k)).join(', ')}
- Trend Summary: ${trends.summary || 'N/A'}`
  : '- No trend data available (run weekly keyword report)'}

**Business Context:**
- Location: ${businessConfig.location}
- Website: ${businessConfig.websiteUrl || 'Not set'}
- Phone: ${businessConfig.phone || 'Not set'}
${websiteContext ? `- Services: ${websiteContext.services?.join(', ') || 'N/A'}` : ''}

## Analysis Request:

Provide a comprehensive analysis with:

1. **Overall Score** (0-100): Rate the GMB profile's current state

2. **Strengths** (array): List 3-5 things the profile is doing well

3. **Weaknesses** (array): List 3-5 areas that need improvement

4. **Recommendations** (array of objects, 5-8 items): Each with:
   - category: e.g., "Reviews", "Posts", "SEO", "Engagement", "Content"
   - priority: "high", "medium", or "low"
   - title: Short recommendation title
   - description: Detailed explanation (2-3 sentences)
   - actionItems: Array of 2-4 specific, actionable steps

5. **Trend Analysis** (string): Analysis of current keyword trends and how to capitalize on them (2-3 paragraphs)

6. **Growth Opportunities** (array): List 3-5 specific growth opportunities based on trends and profile data

7. **AI Summary** (string): Executive summary of the analysis (3-4 paragraphs)

Return your analysis as JSON with this exact structure:
{
  "overallScore": number,
  "strengths": string[],
  "weaknesses": string[],
  "recommendations": [
    {
      "category": string,
      "priority": "high" | "medium" | "low",
      "title": string,
      "description": string,
      "actionItems": string[]
    }
  ],
  "trendAnalysis": string,
  "growthOpportunities": string[],
  "aiSummary": string
}`;

  try {
    const response = await llmService.generate({
      prompt,
      responseFormat: 'json',
    });

    const parsed = JSON.parse(response.content);
    return parsed as ProfileAnalysisResult;
  } catch (error: any) {
    throw new Error(`Failed to generate AI analysis: ${error.message}`);
  }
};

/**
 * Build authenticated HTTP client
 */
const buildClient = async () => {
  let token: string | undefined;
  try {
    token = await getAccessToken();
  } catch (error) {
    token = process.env.GOOGLE_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        'Missing access token. Set up refresh token flow or provide GOOGLE_ACCESS_TOKEN.'
      );
    }
  }

  return axios.create({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
};

