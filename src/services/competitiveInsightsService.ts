import { prisma } from '../db/client';
import { getPlaceDetails, searchTextPlaces, isPlacesConfigured } from './googlePlaces';
import { getLocationDetails } from './locationService';
import { llmService } from './llmService';
import { extractKeywordsFromContent } from './keywordResearch';
import { fetchWebsiteContent } from './websiteScraper';

const milesToMeters = (miles: number) => Math.round(miles * 1609.34);

export const computeVelocity = (params: {
  latestCount: number;
  latestAt: Date;
  prevCount: number;
  prevAt: Date;
}) => {
  const dtDays = Math.max(1 / 24, (params.latestAt.getTime() - params.prevAt.getTime()) / (1000 * 60 * 60 * 24));
  const dCount = params.latestCount - params.prevCount;
  return {
    deltaCount: dCount,
    deltaDays: dtDays,
    perDay: dCount / dtDays,
  };
};

export async function discoverCompetitors(params: {
  businessId: string;
  locationIdInternal: string;
  query: string; // e.g. "dentist"
  radiusMiles?: number;
  limit?: number;
}): Promise<{ upserted: number; competitors: any[] }> {
  if (!isPlacesConfigured()) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  const radiusMiles = typeof params.radiusMiles === 'number' ? params.radiusMiles : 10;
  const limit = typeof params.limit === 'number' ? Math.max(1, Math.min(20, params.limit)) : 10;

  // Use GBP location coordinates for biasing discovery
  const location = await prisma.location.findFirst({
    where: { id: params.locationIdInternal, businessId: params.businessId },
  });
  const googleAccountId = String(location?.googleAccountId || process.env.GOOGLE_ACCOUNT_ID || '').replace(/^accounts\//, '');
  const googleLocationIdRaw = String(location?.googleLocationId || process.env.GOOGLE_LOCATION_ID || '');
  const googleLocationId = googleLocationIdRaw.startsWith('locations/') ? googleLocationIdRaw : `locations/${googleLocationIdRaw}`;

  let center = { latitude: 0, longitude: 0 };
  try {
    const coords = await getLocationDetails({ accountId: googleAccountId, locationId: googleLocationId });
    center = { latitude: coords.latitude, longitude: coords.longitude };
  } catch {
    // fall back to no-bias search
    center = { latitude: 0, longitude: 0 };
  }

  const result = await searchTextPlaces({
    textQuery: `${params.query}`.trim(),
    maxResultCount: limit,
    locationBiasCircle:
      center.latitude !== 0 && center.longitude !== 0
        ? { center, radiusMeters: milesToMeters(radiusMiles) }
        : undefined,
  });

  let upserted = 0;
  const competitors: any[] = [];

  for (const p of result.places || []) {
    const placeId = String((p as any).id || '').trim();
    const name = String((p as any).displayName?.text || '').trim();
    if (!placeId || !name) continue;

    const existing = await prisma.competitor.findUnique({
      where: { businessId_placeId: { businessId: params.businessId, placeId } },
    });

    const safeUpdate = existing?.locked
      ? {
          // allow status updates, but keep key identity fields stable if locked
          status: existing.status,
          source: existing.source,
        }
      : {
          name,
          address: (p as any).formattedAddress || null,
          websiteUrl: (p as any).websiteUri || null,
          phone: (p as any).internationalPhoneNumber || null,
        };

    const row = await prisma.competitor.upsert({
      where: { businessId_placeId: { businessId: params.businessId, placeId } },
      create: {
        businessId: params.businessId,
        locationId: params.locationIdInternal,
        placeId,
        name,
        address: (p as any).formattedAddress || null,
        websiteUrl: (p as any).websiteUri || null,
        phone: (p as any).internationalPhoneNumber || null,
        status: 'active',
        source: 'discovered',
        locked: false,
      },
      update: {
        locationId: params.locationIdInternal,
        ...safeUpdate,
      },
    });

    upserted += 1;
    competitors.push(row);
  }

  return { upserted, competitors };
}

async function analyzeCompetitorWebsite(websiteUrl: string): Promise<{ rating: number; analysis: any } | null> {
  if (!websiteUrl) return null;

  try {
    // Scrape website content
    const websiteData = await fetchWebsiteContent(websiteUrl);
    
    // Prepare content summary for AI analysis
    const contentSummary = {
      practice_name: websiteData.practice_name,
      location: websiteData.location,
      description: websiteData.description || '',
      services: websiteData.services || [],
      unique_selling_points: websiteData.unique_selling_points || [],
      meta_description: websiteData.meta_description || '',
      has_phone: !!websiteData.phone,
      has_email: !!websiteData.email,
      has_address: !!websiteData.address,
    };

    // AI analysis prompt
    const prompt = `You are an SEO and digital marketing expert analyzing a dental practice website.

Website Content Summary:
- Practice Name: ${contentSummary.practice_name}
- Location: ${contentSummary.location}
- Description: ${contentSummary.description || 'Not provided'}
- Services Listed: ${contentSummary.services.length} services (${contentSummary.services.slice(0, 5).join(', ')})
- Unique Selling Points: ${contentSummary.unique_selling_points.length} USPs
- Meta Description: ${contentSummary.meta_description || 'Not provided'}
- Contact Info: Phone: ${contentSummary.has_phone ? 'Yes' : 'No'}, Email: ${contentSummary.has_email ? 'Yes' : 'No'}, Address: ${contentSummary.has_address ? 'Yes' : 'No'}

Analyze this website and rate it 0-100 based on:
1. **SEO** (30 points): meta tags, title optimization, keyword usage, technical SEO basics
2. **Content Quality** (30 points): clarity, completeness, services information, value proposition
3. **Dental-Specific Features** (20 points): appointment booking, patient resources, insurance info, testimonials/reviews integration
4. **User Experience** (20 points): navigation, mobile-friendliness (inferred), contact accessibility, trust signals

Return JSON only with this structure:
{
  "overall_rating": <0-100>,
  "seo": {
    "score": <0-30>,
    "details": ["strength1", "strength2", "weakness1"]
  },
  "content": {
    "score": <0-30>,
    "details": ["strength1", "weakness1"]
  },
  "features": {
    "score": <0-20>,
    "details": ["present feature", "missing feature"]
  },
  "ux": {
    "score": <0-20>,
    "details": ["strength", "concern"]
  },
  "recommendations": ["recommendation1", "recommendation2", "recommendation3"]
}`;

    const completion = await llmService.generate({ prompt, responseFormat: 'json' });
    const analysis = JSON.parse(completion.content || '{}');
    
    const rating = typeof analysis.overall_rating === 'number' 
      ? Math.max(0, Math.min(100, Math.round(analysis.overall_rating)))
      : 0;

    return {
      rating,
      analysis: {
        seo: analysis.seo || { score: 0, details: [] },
        content: analysis.content || { score: 0, details: [] },
        features: analysis.features || { score: 0, details: [] },
        ux: analysis.ux || { score: 0, details: [] },
        recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
      },
    };
  } catch (error: any) {
    console.error('Failed to analyze competitor website:', error);
    return null;
  }
}

export async function ingestCompetitorSnapshot(params: {
  businessId: string;
  competitorId: string;
}): Promise<{ snapshot: any; competitor: any }> {
  if (!isPlacesConfigured()) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  const competitor = await prisma.competitor.findFirst({
    where: { id: params.competitorId, businessId: params.businessId },
  });
  if (!competitor) throw new Error('Competitor not found');

  const details = await getPlaceDetails({
    placeId: competitor.placeId,
    fieldMask:
      'id,displayName,formattedAddress,internationalPhoneNumber,websiteUri,rating,userRatingCount,reviews',
  });

  // Scrape and analyze website if URL exists
  let websiteRating: number | null = null;
  let websiteAnalysis: any = null;
  const websiteUrl = (details as any).websiteUri || competitor.websiteUrl;
  if (websiteUrl) {
    const websiteAnalysisResult = await analyzeCompetitorWebsite(websiteUrl);
    if (websiteAnalysisResult) {
      websiteRating = websiteAnalysisResult.rating;
      websiteAnalysis = websiteAnalysisResult.analysis;
    }
  }

  const snapshot = await prisma.competitorSnapshot.create({
    data: {
      businessId: params.businessId,
      competitorId: competitor.id,
      capturedAt: new Date(),
      rating: typeof details.rating === 'number' ? details.rating : null,
      userRatingsTotal: typeof details.userRatingCount === 'number' ? details.userRatingCount : null,
      reviewsJson: details.reviews ? JSON.stringify(details.reviews) : null,
      websiteRating,
      websiteAnalysisJson: websiteAnalysis ? JSON.stringify(websiteAnalysis) : null,
    },
  });

  // Update competitor core fields if not locked
  if (!competitor.locked) {
    await prisma.competitor.update({
      where: { id: competitor.id },
      data: {
        name: details.displayName?.text || competitor.name,
        address: details.formattedAddress || competitor.address,
        websiteUrl: (details as any).websiteUri || competitor.websiteUrl,
        phone: (details as any).internationalPhoneNumber || competitor.phone,
      },
    });
  }

  return { snapshot, competitor };
}

export async function computeCompetitorVelocity(params: {
  businessId: string;
  competitorId: string;
  windowDays?: number;
}): Promise<{ velocity7d?: any; velocityWindow?: any; latest?: any }> {
  const windowDays = typeof params.windowDays === 'number' ? Math.max(1, params.windowDays) : 7;
  const snapshots = await prisma.competitorSnapshot.findMany({
    where: { businessId: params.businessId, competitorId: params.competitorId },
    orderBy: { capturedAt: 'desc' },
    take: 60,
  });
  if (snapshots.length < 2) return { latest: snapshots[0] || null };

  const latest = snapshots[0];
  const targetMs = latest.capturedAt.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const prev = snapshots.find((s) => s.capturedAt.getTime() <= targetMs) || snapshots[snapshots.length - 1];

  const latestCount = Number(latest.userRatingsTotal || 0);
  const prevCount = Number(prev.userRatingsTotal || 0);

  return {
    latest,
    velocityWindow: computeVelocity({
      latestCount,
      latestAt: latest.capturedAt,
      prevCount,
      prevAt: prev.capturedAt,
    }),
    velocity7d:
      windowDays === 7
        ? undefined
        : computeVelocity({
            latestCount,
            latestAt: latest.capturedAt,
            prevCount,
            prevAt: snapshots.find((s) => s.capturedAt.getTime() <= latest.capturedAt.getTime() - 7 * 24 * 60 * 60 * 1000) || prev,
          }),
  };
}

export async function recomputeCompetitorThemes(params: {
  businessId: string;
  competitorId: string;
  windowDays?: number;
}): Promise<{ themes: any[] }> {
  const windowDays = typeof params.windowDays === 'number' ? Math.max(1, params.windowDays) : 30;

  const latest = await prisma.competitorSnapshot.findFirst({
    where: { businessId: params.businessId, competitorId: params.competitorId },
    orderBy: { capturedAt: 'desc' },
  });
  if (!latest?.reviewsJson) return { themes: [] };

  let reviews: any[] = [];
  try {
    reviews = JSON.parse(latest.reviewsJson);
  } catch {
    reviews = [];
  }
  const reviewTexts = reviews
    .map((r) => String(r?.text?.text || r?.originalText?.text || '').trim())
    .filter(Boolean)
    .slice(0, 20);

  if (reviewTexts.length === 0) return { themes: [] };

  const prompt = `You are analyzing Google reviews for a competitor business.\n\nReviews:\n${reviewTexts
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n')}\n\nReturn JSON with:\n- themes: array of 5-10 objects { theme: string, sentiment: \"negative\"|\"neutral\"|\"positive\", count: number, examples: string[] }\nFocus on common complaint themes (negative) but include major positive themes if present.\nJSON only.`;

  const completion = await llmService.generate({ prompt, responseFormat: 'json' });
  const parsed = JSON.parse(completion.content || '{}');
  const themes = Array.isArray(parsed.themes) ? parsed.themes : [];

  const now = new Date();
  // Use stable UTC day boundaries so repeated runs target the same window rows.
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
  const start = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const periodStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 0, 0, 0));

  // Replace existing period themes (simple approach)
  await prisma.competitorTheme.deleteMany({
    where: { businessId: params.businessId, competitorId: params.competitorId, periodStart, periodEnd },
  });

  const rows: any[] = [];
  for (const t of themes) {
    const theme = String(t?.theme || '').trim();
    if (!theme) continue;
    const row = await prisma.competitorTheme.create({
      data: {
        businessId: params.businessId,
        competitorId: params.competitorId,
        periodStart,
        periodEnd,
        theme,
        sentiment: t?.sentiment ? String(t.sentiment) : null,
        count: typeof t?.count === 'number' ? t.count : 0,
        examplesJson: Array.isArray(t?.examples) ? JSON.stringify(t.examples.slice(0, 5)) : null,
      },
    });
    rows.push(row);
  }

  return { themes: rows };
}

export async function recomputeCompetitorKeywordOverlap(params: {
  businessId: string;
  competitorId: string;
}): Promise<{ competitorKeywords: string[]; businessKeywords: string[]; overlap: string[]; jaccard: number }> {
  const competitor = await prisma.competitor.findFirst({
    where: { id: params.competitorId, businessId: params.businessId },
  });
  if (!competitor) throw new Error('Competitor not found');

  // Business keywords from latest weekly report
  const report = await prisma.keywordWeeklyReport.findFirst({
    where: { businessId: params.businessId },
    orderBy: { reportDate: 'desc' },
  });
  const businessKeywords: string[] = report?.topKeywords ? (() => { try { return JSON.parse(report.topKeywords); } catch { return []; } })() : [];

  // Competitor keywords from website content (best-effort)
  const competitorKeywords: string[] = [];
  if (competitor.websiteUrl) {
    try {
      const { getWebsiteContext } = await import('./websiteContext');
      const ctx = await getWebsiteContext(competitor.websiteUrl);
      const raw = [
        ctx.practice_name,
        ctx.location,
        ctx.description || '',
        ...(ctx.services || []),
        ...(ctx.unique_selling_points || []),
        ctx.meta_description || '',
      ].filter(Boolean);
      competitorKeywords.push(...extractKeywordsFromContent(raw));
    } catch {
      // ignore
    }
  }

  const a = new Set((competitorKeywords || []).map((k) => String(k).toLowerCase()));
  const b = new Set((businessKeywords || []).map((k) => String(k).toLowerCase()));
  const overlap = Array.from(a).filter((k) => b.has(k));
  const union = new Set([...Array.from(a), ...Array.from(b)]);
  const jaccard = union.size > 0 ? overlap.length / union.size : 0;

  await prisma.competitorKeywordProfile.create({
    data: {
      businessId: params.businessId,
      competitorId: params.competitorId,
      capturedAt: new Date(),
      keywordsJson: JSON.stringify(Array.from(a).slice(0, 50)),
    },
  });

  return {
    competitorKeywords: Array.from(a),
    businessKeywords: Array.from(b),
    overlap,
    jaccard,
  };
}


