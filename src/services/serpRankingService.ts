import axios from 'axios';
import { getBusinessConfig } from './businessConfig';

export interface KeywordRankingResult {
  keyword: string;
  location: string;
  gmbRank?: number; // 1-based position in local pack / maps results
  websiteRank?: number; // 1-based position in organic results
  provider: 'serpapi' | 'none';
  notes?: string;
}

const normalizeDomain = (urlOrDomain: string): string => {
  try {
    const withProto = urlOrDomain.startsWith('http') ? urlOrDomain : `https://${urlOrDomain}`;
    return new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return urlOrDomain.replace(/^www\./i, '').toLowerCase();
  }
};

const isSerpApiConfigured = (): boolean => !!process.env.SERPAPI_KEY;

/**
 * Uses SerpAPI to estimate:
 * - GBP rank: position of business in local results (Maps/local pack)
 * - Website rank: organic position of website domain for query
 *
 * Notes:
 * - This is not available via Google Business Profile API directly.
 * - Requires a third-party SERP provider (SerpAPI).
 */
export const getRankingsForKeywords = async (params: {
  keywords: string[];
  location: string; // e.g., "Long Valley, NJ"
  limit?: number; // max keywords to evaluate (cost control)
  businessName?: string; // optional override (competitor)
  websiteDomain?: string; // optional override (competitor domain)
}): Promise<KeywordRankingResult[]> => {
  const { keywords, location } = params;
  const limit = typeof params.limit === 'number' ? params.limit : keywords.length;

  const businessConfig = await getBusinessConfig();
  const businessName =
    params.businessName ||
    process.env.RANKING_BUSINESS_NAME ||
    businessConfig.name;
  const websiteDomain = normalizeDomain(
    params.websiteDomain ||
      process.env.RANKING_WEBSITE_DOMAIN ||
      businessConfig.websiteUrl
  );

  if (!isSerpApiConfigured()) {
    return keywords.slice(0, limit).map((kw) => ({
      keyword: kw,
      location,
      provider: 'none',
      notes: 'SERPAPI_KEY not configured; rankings unavailable',
    }));
  }

  const apiKey = process.env.SERPAPI_KEY!;
  const results: KeywordRankingResult[] = [];

  for (const keyword of keywords.slice(0, limit)) {
    const query = `${keyword} ${location}`;

    let gmbRank: number | undefined;
    let websiteRank: number | undefined;
    const notes: string[] = [];

    // 1) Local (Maps) results
    try {
      const mapsRes = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google_maps',
          q: query,
          hl: 'en',
          api_key: apiKey,
        },
        timeout: 20_000,
      });

      const localResults: any[] = mapsRes.data?.local_results || mapsRes.data?.place_results || [];
      if (Array.isArray(localResults) && localResults.length > 0) {
        const idx = localResults.findIndex((r) => {
          const title = String(r?.title || r?.name || '').toLowerCase();
          return title.includes(String(businessName).toLowerCase());
        });
        if (idx >= 0) gmbRank = idx + 1;
      }
    } catch (e: any) {
      notes.push(`maps_error:${e.response?.status || e.message}`);
    }

    // 2) Organic results
    try {
      const webRes = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google',
          q: query,
          hl: 'en',
          api_key: apiKey,
        },
        timeout: 20_000,
      });

      const organic: any[] = webRes.data?.organic_results || [];
      if (Array.isArray(organic) && organic.length > 0) {
        const idx = organic.findIndex((r) => {
          const link = String(r?.link || '');
          if (!link) return false;
          return normalizeDomain(link) === websiteDomain;
        });
        if (idx >= 0) websiteRank = idx + 1;
      }
    } catch (e: any) {
      notes.push(`web_error:${e.response?.status || e.message}`);
    }

    results.push({
      keyword,
      location,
      gmbRank,
      websiteRank,
      provider: 'serpapi',
      notes: notes.length ? notes.join(',') : undefined,
    });
  }

  return results;
};


