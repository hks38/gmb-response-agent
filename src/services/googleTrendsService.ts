import axios from 'axios';

export interface TrendDataPoint {
  date: string;
  value: number; // 0-100 scale
}

export interface KeywordTrendResult {
  keyword: string;
  timelineData: TrendDataPoint[];
  averages: {
    week: number;
    month: number;
    threeMonths: number;
  };
  maxValue: number;
  minValue: number;
  currentValue: number;
}

/**
 * Get Google Trends data for keywords
 * Uses Google Trends API (unofficial but reliable)
 */
export const getGoogleTrends = async (params: {
  keywords: string[];
  geo?: string; // e.g., "US-NJ" for New Jersey, or "US" for United States
  timeframe?: string; // e.g., "today 3-m" for 3 months
}): Promise<KeywordTrendResult[]> => {
  const { keywords, geo = 'US', timeframe = 'today 3-m' } = params;

  const results: KeywordTrendResult[] = [];

  // Process keywords in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);
    
    for (const keyword of batch) {
      try {
        const trendData = await fetchTrendData(keyword, geo, timeframe);
        results.push(trendData);
        
        // Rate limiting - wait 1 second between requests
        if (i + batchSize < keywords.length || batch.indexOf(keyword) < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error: any) {
        console.error(`Failed to get trends for "${keyword}": ${error.message}`);
        // Continue with next keyword
      }
    }
  }

  return results;
};

/**
 * Fetch trend data from Google Trends
 * This uses the Google Trends API endpoint
 */
const fetchTrendData = async (
  keyword: string,
  geo: string,
  timeframe: string
): Promise<KeywordTrendResult> => {
  try {
    // Use Google Trends API endpoint
    // Note: This is an unofficial API endpoint
    const url = 'https://trends.google.com/trends/api/explore';
    
    const params = new URLSearchParams({
      hl: 'en-US',
      req: JSON.stringify({
        comparisonItem: [{
          keyword,
          geo,
          time: timeframe,
        }],
        category: 0, // All categories
        property: '',
      }),
      tz: '-300', // UTC offset
    });

    // For now, return mock data structure
    // In production, implement actual Google Trends API call or use a service
    
    // Mock implementation - replace with real API
    const timelineData: TrendDataPoint[] = generateMockTrendData(90); // 90 days
    const values = timelineData.map(d => d.value);
    const weekAvg = calculateAverage(values.slice(-7));
    const monthAvg = calculateAverage(values.slice(-30));
    const threeMonthAvg = calculateAverage(values);

    return {
      keyword,
      timelineData,
      averages: {
        week: weekAvg,
        month: monthAvg,
        threeMonths: threeMonthAvg,
      },
      maxValue: Math.max(...values),
      minValue: Math.min(...values),
      currentValue: values[values.length - 1] || 0,
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch trend data: ${error.message}`);
  }
};

/**
 * Generate mock trend data (for development/testing)
 * Replace with actual Google Trends API call in production
 */
const generateMockTrendData = (days: number): TrendDataPoint[] => {
  const data: TrendDataPoint[] = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Generate realistic trend data with some variation
    const baseValue = 30 + Math.sin(i / 7) * 10; // Weekly pattern
    const value = Math.max(0, Math.min(100, baseValue + (Math.random() - 0.5) * 20));
    
    data.push({
      date: date.toISOString().split('T')[0],
      value: Math.round(value),
    });
  }
  
  return data;
};

const calculateAverage = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
};

/**
 * Get geo code from location string (e.g., "Long Valley, NJ" -> "US-NJ")
 */
export const getGeoCode = (location?: string): string => {
  if (!location) return 'US';
  
  // Extract state from location string
  const stateMatch = location.match(/,\s*([A-Z]{2})\b/);
  if (stateMatch && stateMatch[1]) {
    return `US-${stateMatch[1]}`;
  }
  
  return 'US';
};

/**
 * Calculate trend change percentage
 */
export const calculateTrendChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
};


