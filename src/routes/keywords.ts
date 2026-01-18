import express from 'express';
import { prisma } from '../db/client';
import {
  getKeywordCostsForArea,
  getKeywordCostsBySpecialty,
  getAggregatedKeywordCosts,
  fetchKeywordCostsForPractice,
} from '../services/keywordCostService';
import { generateDentalKeywords } from '../services/keywordResearch';
import { researchKeywordTrends } from '../services/keywordTrendService';
import { getRankingsForKeywords } from '../services/serpRankingService';
import { getBusinessConfig } from '../services/businessConfig';
import { requireRole } from '../middleware/rbac';

const router = express.Router();

/**
 * Get keyword costs for a specific area
 * GET /api/keywords/costs/area/:areaId
 */
router.get('/costs/area/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { specialtyType } = req.query;

    let costs;
    if (specialtyType) {
      costs = await prisma.keywordCost.findMany({
        where: {
          areaId,
          specialtyType: specialtyType as string,
        },
        orderBy: { avgCpc: 'desc' },
      });
    } else {
      costs = await getKeywordCostsForArea(areaId);
    }

    res.json({
      success: true,
      costs,
      count: costs.length,
    });
  } catch (err: any) {
    console.error('Failed to get keyword costs:', err);
    res.status(500).json({ error: err.message || 'Failed to get keyword costs' });
  }
});

/**
 * Get keyword costs by specialty type for a practice
 * GET /api/keywords/costs?practiceId=xxx&specialtyType=invisalign
 */
router.get('/costs', async (req, res) => {
  try {
    const { practiceId, specialtyType } = req.query;

    if (!practiceId) {
      return res.status(400).json({ error: 'practiceId is required' });
    }

    const costs = await getKeywordCostsBySpecialty(
      practiceId as string,
      specialtyType as string | undefined
    );

    res.json({
      success: true,
      costs,
      count: costs.length,
    });
  } catch (err: any) {
    console.error('Failed to get keyword costs:', err);
    res.status(500).json({ error: err.message || 'Failed to get keyword costs' });
  }
});

/**
 * Get aggregated keyword costs across all areas
 * GET /api/keywords/costs/aggregated?practiceId=xxx
 */
router.get('/costs/aggregated', async (req, res) => {
  try {
    const { practiceId } = req.query;

    if (!practiceId) {
      return res.status(400).json({ error: 'practiceId is required' });
    }

    const aggregated = await getAggregatedKeywordCosts(practiceId as string);

    res.json({
      success: true,
      keywords: aggregated,
      count: aggregated.length,
    });
  } catch (err: any) {
    console.error('Failed to get aggregated costs:', err);
    res.status(500).json({ error: err.message || 'Failed to get aggregated costs' });
  }
});

/**
 * Fetch fresh keyword costs for a practice
 * POST /api/keywords/costs/fetch
 */
router.post('/costs/fetch', async (req, res) => {
  try {
    const { practiceId, forceRefresh = false } = req.body;

    if (!practiceId) {
      return res.status(400).json({ error: 'practiceId is required' });
    }

    // This is an async operation, so we'll start it and return immediately
    fetchKeywordCostsForPractice(practiceId, forceRefresh).catch(err => {
      console.error('Background keyword cost fetch failed:', err);
    });

    res.json({
      success: true,
      message: 'Keyword cost fetching started. This may take a few minutes.',
    });
  } catch (err: any) {
    console.error('Failed to start keyword cost fetch:', err);
    res.status(500).json({ error: err.message || 'Failed to start keyword cost fetch' });
  }
});

/**
 * GET /api/keywords/trends
 * Get the latest weekly keyword report
 */
router.get('/trends', async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    // Get the latest weekly report from database
    // First try consolidated report (all locations)
    let report = await prisma.keywordWeeklyReport.findFirst({
      where: {
        businessId: tenant.businessId,
        location: { contains: 'All Locations' },
      },
      orderBy: { reportDate: 'desc' },
    });

    // If no consolidated report, get the most recent report
    if (!report) {
      report = await prisma.keywordWeeklyReport.findFirst({
        where: { businessId: tenant.businessId },
        orderBy: { reportDate: 'desc' },
      });
    }
    
    if (!report) {
      return res.json({
        success: false,
        message: 'No weekly report found. Generate a weekly report first.',
      });
    }

    // Parse JSON strings back to arrays
    const topKeywords = report.topKeywords ? JSON.parse(report.topKeywords) : [];
    const trendingUp = report.trendingUp ? JSON.parse(report.trendingUp) : [];
    const trendingDown = report.trendingDown ? JSON.parse(report.trendingDown) : [];

    res.json({
      success: true,
      reportDate: report.reportDate,
      location: report.location,
      latitude: report.latitude,
      longitude: report.longitude,
      radius: report.radius,
      totalKeywords: report.totalKeywords,
      topKeywords,
      trendingUp,
      trendingDown,
      summary: report.summary,
    });
  } catch (err: any) {
    console.error('Failed to get trends', err);
    res.status(500).json({ error: 'Failed to get trends', message: err.message });
  }
});

/**
 * GET /api/keywords/research-defaults
 * Returns default business name and website domain used for ranking comparisons.
 */
router.get('/research-defaults', async (_req, res) => {
  try {
    const cfg = await getBusinessConfig();
    const defaultBusinessName = process.env.RANKING_BUSINESS_NAME || cfg.name;
    // Provide domain, not full URL, for matching
    const defaultWebsiteDomain = (process.env.RANKING_WEBSITE_DOMAIN || cfg.websiteUrl)
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0];

    res.json({
      success: true,
      defaultBusinessName,
      defaultWebsiteDomain,
    });
  } catch (err: any) {
    console.error('Failed to get research defaults', err);
    res.status(500).json({ error: 'Failed to get research defaults', message: err.message });
  }
});

/**
 * POST /api/keywords/research
 * Research keywords for a location
 */
router.post('/research', async (req, res) => {
  try {
    const { location, radius = 10, includeRankings = true, businessName, websiteDomain } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    // Generate dental keywords for the location
    const keywords = generateDentalKeywords(location);

    // Optional: attach ranking data (GBP + website)
    let rankings: any[] = [];
    if (includeRankings) {
      try {
        rankings = await getRankingsForKeywords({
          keywords, // no limit: compute rankings for all generated keywords
          location,
          limit: keywords.length,
          businessName: typeof businessName === 'string' && businessName.trim() ? businessName.trim() : undefined,
          websiteDomain: typeof websiteDomain === 'string' && websiteDomain.trim() ? websiteDomain.trim() : undefined,
        });
      } catch (e: any) {
        // Non-fatal: return keywords anyway
        rankings = [
          {
            provider: 'none',
            keyword: keywords[0],
            location,
            notes: `rankings_error:${e.message}`,
          },
        ];
      }
    }

    res.json({
      success: true,
      keywordsCount: keywords.length,
      topKeywords: keywords.slice(0, 20).map((kw) => ({ keyword: kw })),
      rankings,
      location,
      radius,
    });
  } catch (err: any) {
    console.error('Failed to research keywords', err);
    res.status(500).json({ error: 'Failed to research keywords', message: err.message });
  }
});

/**
 * POST /api/keywords/weekly-report
 * Generate a weekly keyword report for location(s)
 */
router.post('/weekly-report', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const { location } = req.body; // Optional: specific location, or null for all locations
    const tenant = (req as any).tenant as { businessId?: string; locationId?: string | null } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';

    if (!accountId || !locationId) {
      return res.status(400).json({ 
        error: 'GOOGLE_ACCOUNT_ID and GOOGLE_LOCATION_ID must be set' 
      });
    }

    // Clean up location ID (remove "locations/" prefix if present)
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;
    
    const accountIdClean = accountId.replace(/^accounts\//, '');

    // Generate weekly report
    const report = await researchKeywordTrends({
      accountId: accountIdClean,
      locationId: numericLocationId,
      radius: 10,
      businessId: tenant.businessId,
      locationIdInternal: tenant.locationId || undefined,
    });

    res.json({
      success: true,
      report: {
        location: report.location,
        totalKeywords: report.totalKeywords,
        topKeywords: report.topKeywords,
        trendingUp: report.trendingUp,
        trendingDown: report.trendingDown,
        summary: report.summary,
      },
      message: 'Weekly report generated successfully',
    });
  } catch (err: any) {
    console.error('Failed to generate weekly report', err);
    res.status(500).json({ 
      error: 'Failed to generate weekly report', 
      message: err.message 
    });
  }
});

export default router;
