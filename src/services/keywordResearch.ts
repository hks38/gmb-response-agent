import axios from 'axios';

export interface KeywordTrendData {
  keyword: string;
  searchVolume: number; // 0-100 scale
  trendScore: number;
  previousWeekScore?: number;
  change?: number; // Percentage change
}

export interface GoogleTrendsResult {
  keyword: string;
  interest: number[]; // Array of interest over time
  averages: number[];
  timeline: string[];
}

/**
 * Get keyword trends from Google Trends
 * Note: This uses an unofficial method. For production, consider using official APIs or services.
 */
export const getKeywordTrends = async (params: {
  keywords: string[];
  location?: string;
  geo?: string; // Geo code (e.g., "US-NJ" for New Jersey)
  timeframe?: string; // e.g., "today 3-m" for 3 months
}): Promise<KeywordTrendData[]> => {
  const { keywords, location, geo, timeframe = 'today 3-m' } = params;

  // For MVP, we'll use a simplified approach
  // In production, you might want to use:
  // - Google Trends API (if available)
  // - SerpAPI
  // - DataForSEO
  // - Or scrape Google Trends (with rate limiting)

  const results: KeywordTrendData[] = [];

  for (const keyword of keywords) {
    try {
      // Simulated trend data - replace with actual API call
      // This is a placeholder that would be replaced with real Google Trends data
      const trendData = await fetchGoogleTrendsData({
        keyword,
        location,
        geo,
        timeframe,
      });

      // Calculate trend score (average interest over last 7 days vs previous week)
      const recentWeek = trendData.interest.slice(-7);
      const previousWeek = trendData.interest.slice(-14, -7);
      
      const recentAvg = recentWeek.reduce((a, b) => a + b, 0) / recentWeek.length || 0;
      const previousAvg = previousWeek.reduce((a, b) => a + b, 0) / previousWeek.length || 0;
      
      const change = previousAvg > 0 
        ? ((recentAvg - previousAvg) / previousAvg) * 100 
        : 0;

      results.push({
        keyword,
        searchVolume: recentAvg,
        trendScore: recentAvg,
        previousWeekScore: previousAvg,
        change,
      });

      // Rate limiting - avoid hitting limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error: any) {
      console.error(`Failed to get trends for "${keyword}": ${error.message}`);
      // Continue with next keyword
    }
  }

  return results;
};

/**
 * Fetch Google Trends data using unofficial API
 * This is a placeholder - you'll need to implement actual Google Trends integration
 */
const fetchGoogleTrendsData = async (params: {
  keyword: string;
  location?: string;
  geo?: string;
  timeframe?: string;
}): Promise<GoogleTrendsResult> => {
  // TODO: Implement actual Google Trends API integration
  // Options:
  // 1. Use google-trends-api npm package (unofficial)
  // 2. Use SerpAPI for keyword research
  // 3. Use DataForSEO API
  // 4. Scrape Google Trends (with proper rate limiting)

  // For now, return mock data structure
  // In production, replace with actual API call
  
  // Mock data - replace with real API
  const mockInterest = Array.from({ length: 90 }, () => 
    Math.floor(Math.random() * 50) + 25
  );

  return {
    keyword: params.keyword,
    interest: mockInterest,
    averages: [30, 35, 40], // Weekly averages
    timeline: [],
  };
};

/**
 * Generate dental-related keywords for research
 */
export const generateDentalKeywords = (location?: string): string[] => {
  const baseKeywords = [
    'dentist',
    'dentist near me',
    'dental cleaning',
    'teeth whitening',
    'dental implants',
    'root canal',
    'crowns',
    'fillings',
    'emergency dentist',
    'pediatric dentist',
    'orthodontist',
    'dental checkup',
    'teeth cleaning',
    'dental exam',
    'oral surgery',
    'gum disease treatment',
    'tooth extraction',
    'veneers',
    'Invisalign',
    'braces',
    'family dentist',
    'cosmetic dentist',
    'dental X-ray',
    'fluoride treatment',
    'deep cleaning',
    'wisdom teeth removal',
    'dental bonding',
    'teeth straightening',
  ];

  // If location provided, add location-specific variations
  if (location) {
    const locationKeywords = baseKeywords.map(kw => 
      `${kw} ${location}`
    );
    return [...baseKeywords, ...locationKeywords];
  }

  return baseKeywords;
};

/**
 * Get common dental keywords from reviews and posts
 * Extracts keywords that appear frequently in reviews
 */
export const extractKeywordsFromContent = (content: string[]): string[] => {
  const keywordPatterns = [
    /\b(dentist|dental|teeth|tooth|oral|gum|smile|cleaning|exam|checkup|whitening|implant|root canal|crown|filling|emergency|pediatric|orthodontic|cosmetic|braces|invisalign)\b/gi,
  ];

  const foundKeywords = new Set<string>();

  for (const text of content) {
    for (const pattern of keywordPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => foundKeywords.add(match.toLowerCase()));
      }
    }
  }

  return Array.from(foundKeywords);
};


