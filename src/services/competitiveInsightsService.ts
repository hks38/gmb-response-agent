import { prisma } from '../db/client';
import { getPlaceDetails, searchTextPlaces, isPlacesConfigured } from './googlePlaces';
import { getLocationDetails } from './locationService';
import { llmService } from './llmService';
import { extractKeywordsFromContent } from './keywordResearch';
import { fetchWebsiteContent } from './websiteScraper';
import * as fs from 'fs';
import * as path from 'path';

// Debug logging helper for Node.js backend
const debugLog = (location: string, message: string, data: any, hypothesisId: string | string[]) => {
  try {
    const logEntry = JSON.stringify({
      location,
      message,
      data,
      timestamp: Date.now(),
      sessionId: 'debug-session',
      hypothesisId: Array.isArray(hypothesisId) ? hypothesisId.join(',') : hypothesisId,
    }) + '\n';
    fs.appendFileSync(path.join(process.cwd(), '.cursor', 'debug.log'), logEntry);
  } catch (e) {
    // Silently fail if logging fails
  }
};

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

/**
 * AI verification to check if a business is a dental practice
 */
async function verifyDentalPractice(params: {
  name: string;
  address?: string;
  websiteUrl?: string;
  primaryType?: string;
  types?: string[];
}): Promise<boolean> {
  try {
    const prompt = `You are verifying if a business is a dental practice. Analyze the following information:

Business Name: ${params.name}
Address: ${params.address || 'Not provided'}
Website URL: ${params.websiteUrl || 'Not provided'}
Business Type: ${params.primaryType || 'Not provided'}
All Types: ${params.types?.join(', ') || 'Not provided'}

Determine if this business is:
1. A dental practice (dentist office, dental clinic, pediatric dentist, dental implant provider, etc.)
2. A general dentistry practice or offers general dental services
3. NOT a restaurant, pizza shop, or other non-dental business
4. NOT an orthodontist-only practice (unless it also offers general dentistry)

Return JSON only with this structure:
{
  "is_dental_practice": true/false,
  "reason": "brief explanation"
}

Examples:
- "Pezzo Pizza 2" → {"is_dental_practice": false, "reason": "Pizza restaurant, not a dental practice"}
- "Dr. John Smith, DDS" → {"is_dental_practice": true, "reason": "Dental practice with DDS designation"}
- "Califon Dental Arts" (orthodontist only) → {"is_dental_practice": false, "reason": "Orthodontist-only practice, does not offer general dentistry"}
- "Long Valley Family Dentistry" → {"is_dental_practice": true, "reason": "General family dental practice"}`;

    const completion = await llmService.generate({ prompt, responseFormat: 'json' });
    const result = JSON.parse(completion.content || '{}');
    
    return result.is_dental_practice === true;
  } catch (error) {
    console.error('AI verification failed:', error);
    // Fall back to false if AI verification fails (safer to exclude than include)
    return false;
  }
}

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

  // Allowed dental business types from Google Places API
  const allowedDentalTypes = [
    'dentist',
    'dental_clinic',
    'dental_office',
    'dental_implant_provider',
    'pediatric_dentist',
    'general_dentist',
    'cosmetic_dentist',
    'oral_surgeon',
    'orthodontist', // Include orthodontists as they can still be competitors
    'periodontist',
    'endodontist',
    'prosthodontist',
  ].map(t => t.toLowerCase());

    // Keywords to filter out non-dental businesses
  // Added "ristorante" to catch Italian restaurants
  const excludeKeywords = [
    'pizza', 'restaurant', 'ristorante', 'cafe', 'coffee', 'trattoria', 'pizzeria', 
    'bar', 'bakery', 'food', 'delivery', 'takeout',
    'veterinary', 'vet', 'animal', 'pet',
    'hospital', 'clinic', 'medical center', 'urgent care', 'emergency room',
    'pharmacy', 'drugstore',
    'spa', 'salon', 'beauty', 'massage',
    'law', 'lawyer', 'attorney', 'legal',
    'auto', 'car', 'vehicle', 'repair',
    'real estate', 'realtor',
  ].map(k => k.toLowerCase());

  // Keywords to identify dental practices in name (fallback if type check fails)
  const dentalKeywords = [
    'dental', 'dentist', 'dentistry', 'dds', 'dmd',
    'oral', 'teeth', 'tooth', 'smile',
  ].map(k => k.toLowerCase());

  for (const p of result.places || []) {
    const placeId = String((p as any).id || '').trim();
    const name = String((p as any).displayName?.text || '').trim();
    if (!placeId || !name) continue;

    // #region agent log
    debugLog('competitiveInsightsService.ts:148', 'Processing competitor candidate', { name, placeId }, ['A', 'B', 'C']);
    // #endregion

    // Check business name for filtering
    const nameLower = name.toLowerCase().trim();
    const address = String((p as any).formattedAddress || '').toLowerCase().trim();
    const websiteUrl = String((p as any).websiteUri || '').toLowerCase().trim();
    
    // Get primary type and other types from Google Places API
    const primaryType = String((p as any).primaryType || '').toLowerCase().trim();
    const types = Array.isArray((p as any).types) 
      ? (p as any).types.map((t: any) => String(t).toLowerCase().trim())
      : [];
    const allTypes = [primaryType, ...types].filter(Boolean);
    
    // CRITICAL: Stage 0 - Immediate exclusion for obvious non-dental businesses
    // Check name FIRST before anything else - this is the most reliable indicator
    // This MUST catch businesses like "Pezzo Pizza", "Pizza Hut", "Taste of Italy Ristorante", etc. based on general patterns
    const immediateExcludePatterns = [
      /\bpizza\b/i,           // Catches "Pezzo Pizza", "Pizza Hut", etc.
      /\btrattoria\b/i,
      /\bpizzeria\b/i,
      /\bristorante\b/i,      // Catches Italian restaurants like "Taste of Italy Ristorante & Pizzeria"
      /\brestaurant\b/i,
      /\bcafe\b/i,
      /\bcoffee\b/i,
      /\bbar\s+\d+/i,
      /\btavern\b/i,
      /\bpub\b/i,
      /\bgrill\b/i,
      /\bdiner\b/i,
      /\bbakery\b/i,
      /\bfood\b.*\bdelivery\b/i,
      /\bauto\b/i,
      /\bcar\s+dealer\b/i,
      /\bmechanic\b/i,
      /\blaw\s+firm\b/i,
      /\battorney\b/i,
      /\blawyer\b/i,
      /\breal\s+estate\b/i,
      /\brealtor\b/i,
      /\bvet\s+clinic\b/i,
      /\bveterinary\b/i,
    ];
    
    // Check name against immediate exclude patterns
    const matchesImmediateExcludePattern = immediateExcludePatterns.some(pattern => pattern.test(name));
    
    // Also check simple keyword matches for common restaurant words (fallback check)
    // Note: "pizza" pattern already catches "Pezzo Pizza" - no need to hardcode specific restaurant names
    // Added "ristorante" to catch Italian restaurants like "Taste of Italy Ristorante & Pizzeria"
    const immediateExcludeKeywords = ['pizza', 'trattoria', 'pizzeria', 'ristorante', 'restaurant', 'cafe', 'coffee', 'bar', 'tavern', 'pub', 'grill', 'diner', 'bakery', 'auto', 'mechanic', 'attorney', 'lawyer', 'realtor', 'veterinary'];
    const hasImmediateExcludeKeyword = immediateExcludeKeywords.some(kw => nameLower.includes(kw));
    
    // #region agent log
    debugLog('competitiveInsightsService.ts:200', 'Stage 0 filtering check', {
      name,
      nameLower,
      matchesImmediateExcludePattern,
      hasImmediateExcludeKeyword,
      matchedKeywords: immediateExcludeKeywords.filter(kw => nameLower.includes(kw)),
    }, ['A', 'D']);
    // #endregion
    
    // Check name against immediate exclude patterns OR keywords
    if (matchesImmediateExcludePattern || hasImmediateExcludeKeyword) {
      // #region agent log
      debugLog('competitiveInsightsService.ts:205', 'FILTERED OUT - Stage 0 exclusion', {
        name,
        matchesImmediateExcludePattern,
        hasImmediateExcludeKeyword,
      }, 'A');
      // #endregion
      console.log(`❌ IMMEDIATE EXCLUSION: ${name} (matches exclude pattern or keyword)`);
      continue;
    }
    
    // Stage 1: STRICT exclude keyword check (pizza, restaurant, etc.) - this overrides everything
    // Check name first (most reliable), then address, then website
    const excludeMatch = excludeKeywords.find(k => {
      // Use word boundaries for more accurate matching
      const keywordRegex = new RegExp(`\\b${k}\\b`, 'i');
      return keywordRegex.test(name) || 
             keywordRegex.test(address) || 
             keywordRegex.test(websiteUrl);
    });
    
    // #region agent log
    debugLog('competitiveInsightsService.ts:218', 'Stage 1 filtering check', {
      name,
      excludeMatch,
      primaryType,
      types: allTypes,
    }, 'B');
    // #endregion
    
    if (excludeMatch) {
      // #region agent log
      debugLog('competitiveInsightsService.ts:221', 'FILTERED OUT - Stage 1 exclude keyword', {
        name,
        excludeMatch,
      }, 'B');
      // #endregion
      console.log(`❌ Filtered out non-dental business: ${name} (contains exclude keyword: "${excludeMatch}")`);
      continue;
    }
    
    // Primary filter: Check if business type is in allowed dental types
    const isAllowedDentalType = allTypes.some(type => 
      allowedDentalTypes.some(allowed => type.includes(allowed) || allowed.includes(type))
    );
    
    // Secondary check: If no type match, check name for dental keywords
    const hasDentalKeyword = dentalKeywords.some(keyword => {
      const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
      return keywordRegex.test(nameLower);
    });
    
    // Stage 2: Must have dental keywords OR be an allowed dental type
    // This is a stricter check - if neither, definitely exclude
    if (!isAllowedDentalType && !hasDentalKeyword) {
      console.log(`❌ Filtered out non-dental business: ${name} (not a dental type: ${primaryType || types.join(', ') || 'unknown'}, no dental keywords in name)`);
      continue;
    }
    
    // Stage 3: Additional name-based checks for common false positives
    // Check for patterns that indicate non-dental businesses
    // Added "ristorante" to catch Italian restaurants
    const suspiciousPatterns = [
      /pizza|pizzeria|trattoria|ristorante|restaurant|cafe|coffee|bakery/i,
      /bar\s+\d+|tavern|pub|grill|diner/i,
      /auto|car\s+dealer|mechanic|repair/i,
      /law\s+firm|attorney|lawyer/i,
      /real\s+estate|realtor/i,
      /vet\s+clinic|veterinary|animal\s+hospital/i,
    ];
    
    const matchesSuspiciousPattern = suspiciousPatterns.some(pattern => pattern.test(name));
    // #region agent log
    debugLog('competitiveInsightsService.ts:253', 'Stage 3 filtering check', {
      name,
      isAllowedDentalType,
      hasDentalKeyword,
      matchesSuspiciousPattern,
    }, 'D');
    // #endregion
    
    if (matchesSuspiciousPattern) {
      // #region agent log
      debugLog('competitiveInsightsService.ts:256', 'FILTERED OUT - Stage 3 suspicious pattern', { name }, 'D');
      // #endregion
      console.log(`❌ Filtered out suspicious business name: ${name} (matches non-dental pattern)`);
      continue;
    }
    
    // Stage 4: AI verification - final check with AI for ambiguous cases
    // Only verify businesses that passed all initial filters
    console.log(`🤖 Verifying with AI: ${name}...`);
    try {
      const aiVerified = await verifyDentalPractice({
        name,
        address: (p as any).formattedAddress || undefined,
        websiteUrl: (p as any).websiteUri || undefined,
        primaryType,
        types: allTypes,
      });
      
      if (!aiVerified) {
        console.log(`❌ Filtered out by AI verification: ${name} (AI confirmed: not a dental practice)`);
        continue;
      }
      
      console.log(`✓ AI verified as dental practice: ${name}`);
    } catch (error) {
      // If AI verification fails, fall back to stricter name/type checks
      console.warn(`⚠️ AI verification failed for ${name}, using fallback logic:`, error);
      // Require both dental type AND dental keyword if AI fails
      if (!isAllowedDentalType || !hasDentalKeyword) {
        console.log(`❌ Filtered out (AI failed + no strong dental indicators): ${name}`);
        continue;
      }
      console.log(`⚠️ Allowed ${name} (AI failed but has dental type/keyword)`);
    }

    const existing = await prisma.competitor.findUnique({
      where: { businessId_placeId: { businessId: params.businessId, placeId } },
    });

    // Extract coordinates from Places API response
    const location = (p as any).location || {};
    const latitude = typeof location.latitude === 'number' ? location.latitude : null;
    const longitude = typeof location.longitude === 'number' ? location.longitude : null;

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
          latitude,
          longitude,
        };

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/ff6ae596-1b17-49b0-869d-604ced03461b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'competitiveInsightsService.ts:290',message:'PASSED ALL FILTERS - Adding to database',data:{name,placeId,isAllowedDentalType,hasDentalKeyword,primaryType,types:allTypes},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C,E'})}).catch(()=>{});
    // #endregion
    
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
        latitude,
        longitude,
        status: 'active',
        source: 'discovered',
        locked: false,
      },
      update: {
        locationId: params.locationIdInternal,
        ...safeUpdate,
        // Always update coordinates if available (they don't change but might be missing)
        latitude: latitude ?? existing?.latitude ?? undefined,
        longitude: longitude ?? existing?.longitude ?? undefined,
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
    
    // Prepare comprehensive content for AI analysis
    const specialtyServicesList = websiteData.specialty_services && websiteData.specialty_services.length > 0
      ? websiteData.specialty_services.join(', ')
      : 'None specifically mentioned';
    
    const insuranceList = websiteData.insurance_carriers && websiteData.insurance_carriers.length > 0
      ? websiteData.insurance_carriers.join(', ')
      : 'Not specified or not accepting insurance';

    // Use full text content if available for comprehensive analysis, otherwise use summary
    const analysisContent = websiteData.full_text_content 
      ? websiteData.full_text_content.substring(0, 40000) // Limit to 40k chars for prompt
      : (websiteData.description || '');

    // AI analysis prompt with comprehensive content
    const prompt = `You are an SEO and digital marketing expert analyzing a dental practice website. Analyze ALL the scraped content thoroughly.

PRACTICE INFORMATION:
- Practice Name: ${websiteData.practice_name}
- Location: ${websiteData.location}
- Website URL: ${websiteUrl}

SERVICES & SPECIALTIES:
- General Services (${websiteData.services.length}): ${websiteData.services.slice(0, 10).join(', ')}${websiteData.services.length > 10 ? '...' : ''}
- **SPECIALTY SERVICES OFFERED**: ${specialtyServicesList}
  * Important: Identify all advanced procedures like veneers, implants, root canals, all-on-4, all-on-x, crowns, bridges, oral surgery, etc.
  * List every specialty service you find in the content.

INSURANCE & PAYMENT:
- **INSURANCE CARRIERS ACCEPTED**: ${insuranceList}
  * Important: Identify all insurance companies mentioned (Aetna, Cigna, Delta Dental, Blue Cross, Medicare, Medicaid, etc.)
  * Note if they accept insurance or mention "cash only", "no insurance", etc.

CONTENT SUMMARY:
- Description: ${websiteData.description || 'Not provided'}
- Meta Description: ${websiteData.meta_description || 'Not provided'}
- Unique Selling Points: ${websiteData.unique_selling_points.join(', ') || 'None'}
- Contact: Phone: ${websiteData.phone ? 'Yes' : 'No'}, Email: ${websiteData.email ? 'Yes' : 'No'}, Address: ${websiteData.address ? 'Yes' : 'No'}

FULL WEBSITE CONTENT (for comprehensive analysis):
${analysisContent.substring(0, 35000)}

Analyze this website comprehensively and rate it 0-100 based on:
1. **SEO** (30 points): meta tags, title optimization, keyword usage, technical SEO basics, content structure
2. **Content Quality** (30 points): clarity, completeness, services information, specialty services detail, value proposition
3. **Dental-Specific Features** (20 points): appointment booking, patient resources, insurance information clarity, testimonials/reviews integration
4. **User Experience** (20 points): navigation, mobile-friendliness (inferred), contact accessibility, trust signals

**CRITICAL REQUIREMENTS:**
- In the response, you MUST include a "specialty_services" array listing ALL specialty services found (veneers, implants, root canal, all-on-4, all-on-x, etc.)
- You MUST include an "insurance_carriers" array listing ALL insurance companies mentioned
- Analyze the FULL content provided, not just the summary

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
  "specialty_services": ["service1", "service2", "service3"],
  "insurance_carriers": ["carrier1", "carrier2"] or [],
  "recommendations": ["recommendation1", "recommendation2", "recommendation3"]
}`;

    const completion = await llmService.generate({ prompt, responseFormat: 'json' });
    const analysis = JSON.parse(completion.content || '{}');
    
    const rating = typeof analysis.overall_rating === 'number' 
      ? Math.max(0, Math.min(100, Math.round(analysis.overall_rating)))
      : 0;

    // Extract specialty services and insurance carriers from AI analysis, or use scraped data
    const aiSpecialtyServices = Array.isArray(analysis.specialty_services) 
      ? analysis.specialty_services 
      : (websiteData.specialty_services || []);
    
    const aiInsuranceCarriers = Array.isArray(analysis.insurance_carriers)
      ? analysis.insurance_carriers
      : (websiteData.insurance_carriers || []);

    // Combine AI-extracted data with scraped data (prefer AI if available, as it's more comprehensive)
    const finalSpecialtyServices = aiSpecialtyServices.length > 0 
      ? aiSpecialtyServices 
      : websiteData.specialty_services || [];
    
    const finalInsuranceCarriers = aiInsuranceCarriers.length > 0
      ? aiInsuranceCarriers
      : websiteData.insurance_carriers || [];

    return {
      rating,
      analysis: {
        seo: analysis.seo || { score: 0, details: [] },
        content: analysis.content || { score: 0, details: [] },
        features: analysis.features || { score: 0, details: [] },
        ux: analysis.ux || { score: 0, details: [] },
        specialty_services: finalSpecialtyServices,
        insurance_carriers: finalInsuranceCarriers,
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
      'id,displayName,formattedAddress,internationalPhoneNumber,websiteUri,rating,userRatingCount,reviews,location',
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
    const location = (details as any).location || {};
    const latitude = typeof location.latitude === 'number' ? location.latitude : null;
    const longitude = typeof location.longitude === 'number' ? location.longitude : null;
    
    await prisma.competitor.update({
      where: { id: competitor.id },
      data: {
        name: details.displayName?.text || competitor.name,
        address: details.formattedAddress || competitor.address,
        websiteUrl: (details as any).websiteUri || competitor.websiteUrl,
        phone: (details as any).internationalPhoneNumber || competitor.phone,
        latitude: latitude ?? competitor.latitude ?? undefined,
        longitude: longitude ?? competitor.longitude ?? undefined,
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


