import { GoogleAdsApi } from 'google-ads-api';
import dotenv from 'dotenv';

dotenv.config();

export interface KeywordCostData {
  keyword: string;
  avgCpc: number;
  minCpc: number;
  maxCpc: number;
  searchVolume: number;
  competition: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Google Ads API Service
 * Handles authentication and keyword cost queries using Google Ads Keyword Planner API
 */
export class GoogleAdsService {
  private isApiConfigured: boolean = false;
  private client: GoogleAdsApi | null = null;
  private customerId: string | null = null;

  constructor() {
    this.checkConfiguration();
    if (this.isApiConfigured) {
      this.initializeClient();
    }
  }

  private checkConfiguration() {
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    this.isApiConfigured = !!(
      customerId &&
      developerToken &&
      clientId &&
      clientSecret &&
      refreshToken
    );

    if (this.isApiConfigured) {
      this.customerId = customerId!;
      console.log('Google Ads API configured successfully');
    } else {
      console.warn(
        'Google Ads API credentials not configured. Using mock data. ' +
        'Set GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN, ' +
        'GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN in .env'
      );
    }
  }

  private initializeClient() {
    if (!this.isApiConfigured) return;

    try {
      this.client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
        developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      });
    } catch (error: any) {
      console.error('Failed to initialize Google Ads client:', error.message);
      this.isApiConfigured = false;
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.isApiConfigured && this.client !== null;
  }

  /**
   * Get keyword cost data using Keyword Plan Idea Service
   * Note: This requires Google Ads API access and proper permissions
   */
  async getKeywordCosts(
    keywords: string[],
    locationGeocode?: string
  ): Promise<KeywordCostData[]> {
    if (!this.isConfigured()) {
      console.log('Google Ads API not configured, using mock data');
      return this.getMockKeywordCosts(keywords, locationGeocode);
    }

    try {
      const customer = this.client!.Customer({
        customer_id: this.customerId!,
        refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      });

      // Prepare geo target constants if location is provided
      // Note: locationGeocode should be in format like "geoTargetConstants/2840" for US
      // For now, we'll use a default or parse the location
      const geoTargetConstants = locationGeocode
        ? this.parseLocationGeocode(locationGeocode)
        : undefined;

      // Generate keyword ideas with metrics
      const request: any = {
        customer_id: this.customerId!,
        keyword_seed: {
          keywords: keywords,
        },
        language_constant: 'languageConstants/1000', // English
      };

      // Add geo target constants if provided
      if (geoTargetConstants && geoTargetConstants.length > 0) {
        (request as any).geo_target_constants = geoTargetConstants;
      }

      // google-ads-api typings have changed across versions; treat as any to keep compile stable
      const response: any = await (customer as any).keywordPlanIdeas.generateKeywordIdeas(request as any);

      // Process the results
      // The response structure may vary, so we handle both array and object formats
      const results = Array.isArray(response)
        ? response
        : (response.results || response.keyword_ideas || response.keywordIdeas || []);

      return this.processApiResults(results);
    } catch (error: any) {
      console.error('Error fetching keyword costs from Google Ads API:', error.message);
      console.error('Falling back to mock data');
      // Fall back to mock data on error
      return this.getMockKeywordCosts(keywords, locationGeocode);
    }
  }

  /**
   * Parse location geocode string to Google Ads format
   * Converts city/state format to geoTargetConstants format if possible
   */
  private parseLocationGeocode(locationGeocode: string): string[] | undefined {
    // If it's already in the correct format, return it
    if (locationGeocode.startsWith('geoTargetConstants/')) {
      return [locationGeocode];
    }

    // For city, state format, we'd need to look up the geoTargetConstant ID
    // For now, return undefined to use default targeting
    // In production, you'd use GeoTargetConstantService to resolve location names to IDs
    return undefined;
  }

  /**
   * Process API results and convert to KeywordCostData format
   */
  private processApiResults(results: any[]): KeywordCostData[] {
    if (!results || results.length === 0) {
      return [];
    }

    return results.map((result: any) => {
      // Extract keyword text - handle different response formats
      const keywordText = result.text || result.keyword_text || result.keyword || '';
      
      // Extract metrics - handle different response formats
      const metrics = result.keyword_idea_metrics || result.metrics || result;

      if (!metrics || (!metrics.avg_monthly_searches && !metrics.search_volume)) {
        // If no metrics, return default values
        return {
          keyword: keywordText,
          avgCpc: 0,
          minCpc: 0,
          maxCpc: 0,
          searchVolume: 0,
          competition: 'MEDIUM' as const,
        };
      }

      // Extract metrics with fallbacks
      const avgMonthlySearches = metrics.avg_monthly_searches 
        || metrics.search_volume 
        || metrics.avg_monthly_search_volume 
        || 0;
      
      const competition = this.mapCompetitionEnum(
        metrics.competition 
        || metrics.competition_index 
        || metrics.competition_level
      );
      
      // Calculate CPC estimates
      // Google Ads API provides low_top_of_page_bid and high_top_of_page_bid in micros
      let lowBid = 0;
      let highBid = 0;

      if (metrics.low_top_of_page_bid) {
        if (typeof metrics.low_top_of_page_bid === 'object' && metrics.low_top_of_page_bid.micros) {
          lowBid = metrics.low_top_of_page_bid.micros / 1_000_000;
        } else if (typeof metrics.low_top_of_page_bid === 'number') {
          lowBid = metrics.low_top_of_page_bid;
        }
      }

      if (metrics.high_top_of_page_bid) {
        if (typeof metrics.high_top_of_page_bid === 'object' && metrics.high_top_of_page_bid.micros) {
          highBid = metrics.high_top_of_page_bid.micros / 1_000_000;
        } else if (typeof metrics.high_top_of_page_bid === 'number') {
          highBid = metrics.high_top_of_page_bid;
        }
      }

      // Use provided bids or estimate from competition
      const avgCpc = (lowBid > 0 && highBid > 0)
        ? (lowBid + highBid) / 2 
        : this.estimateCpcFromCompetition(competition, avgMonthlySearches);

      const minCpc = lowBid > 0 ? lowBid : avgCpc * 0.7;
      const maxCpc = highBid > 0 ? highBid : avgCpc * 1.5;

      return {
        keyword: keywordText,
        avgCpc: Math.round(avgCpc * 100) / 100,
        minCpc: Math.round(minCpc * 100) / 100,
        maxCpc: Math.round(maxCpc * 100) / 100,
        searchVolume: avgMonthlySearches,
        competition,
      };
    }).filter(result => result.keyword.length > 0); // Filter out empty keywords
  }

  /**
   * Map Google Ads competition enum to our format
   */
  private mapCompetitionEnum(competition?: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (!competition) return 'MEDIUM';
    
    const upper = competition.toUpperCase();
    if (upper.includes('LOW') || upper === 'UNSPECIFIED') return 'LOW';
    if (upper.includes('MEDIUM') || upper.includes('MODERATE')) return 'MEDIUM';
    if (upper.includes('HIGH')) return 'HIGH';
    return 'MEDIUM';
  }

  /**
   * Estimate CPC based on competition and search volume
   */
  private estimateCpcFromCompetition(
    competition: 'LOW' | 'MEDIUM' | 'HIGH',
    volume: number
  ): number {
    // Base CPC by competition level
    const baseCpc = {
      LOW: 2.0,
      MEDIUM: 5.0,
      HIGH: 8.0,
    }[competition];

    // Adjust based on volume (higher volume = higher competition = higher cost)
    const volumeMultiplier = Math.min(volume / 10000, 2); // Cap at 2x

    return baseCpc * (1 + volumeMultiplier * 0.3);
  }

  /**
   * Get mock keyword costs for development/testing
   * Includes location-based variations to simulate real data
   */
  private getMockKeywordCosts(
    keywords: string[],
    locationGeocode?: string
  ): KeywordCostData[] {
    const specialtyKeywords = [
      'full mouth veneers',
      'invisalign',
      'all on 4',
      'all-on-4',
      'dental implants',
      'cosmetic dentistry',
      'veneers',
      'implant',
    ];

    // Location-based cost multiplier (urban areas typically cost more)
    const locationMultiplier = locationGeocode ? 1.0 + (Math.random() * 0.5) : 1.0;

    return keywords.map(keyword => {
      const lowerKeyword = keyword.toLowerCase();
      const isSpecialty = specialtyKeywords.some(sk =>
        lowerKeyword.includes(sk.toLowerCase())
      );
      
      // Specialty procedures typically cost more
      let baseCpc = isSpecialty ? 8.0 : 3.0;
      let volume = isSpecialty ? 5000 : 2000;
      
      // Adjust based on keyword specificity
      if (lowerKeyword.includes('near me') || lowerKeyword.includes('in ')) {
        baseCpc *= 1.2; // Local searches cost more
        volume *= 1.5;
      }
      
      // Apply location multiplier
      baseCpc *= locationMultiplier;
      
      // Add some randomness for realism
      const variation = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
      const avgCpc = baseCpc * variation;

      // Determine competition based on cost and volume
      let competition: 'LOW' | 'MEDIUM' | 'HIGH';
      if (avgCpc > 7 || volume > 8000) {
        competition = 'HIGH';
      } else if (avgCpc > 4 || volume > 3000) {
        competition = 'MEDIUM';
      } else {
        competition = 'LOW';
      }

      return {
        keyword,
        avgCpc: Math.round(avgCpc * 100) / 100,
        minCpc: Math.round(avgCpc * 0.7 * 100) / 100,
        maxCpc: Math.round(avgCpc * 1.5 * 100) / 100,
        searchVolume: volume + Math.floor(Math.random() * 2000),
        competition,
      };
    });
  }
}

// Export singleton instance
export const googleAdsService = new GoogleAdsService();

