import express from 'express';
import { prisma } from '../db/client';
import { requireRole } from '../middleware/rbac';
import {
  discoverCompetitors,
  ingestCompetitorSnapshot,
  computeCompetitorVelocity,
  recomputeCompetitorThemes,
  recomputeCompetitorKeywordOverlap,
} from '../services/competitiveInsightsService';
import { getPlaceDetails, isPlacesConfigured } from '../services/googlePlaces';
import { getLocationDetails } from '../services/locationService';
import { discoverCommunityPoints, getCommunityPoints } from '../services/communityDiscoveryService';
import { getDemographicData } from '../services/demographicDataService';
import { prepareMapData, generateHeatmapData, identifyCompetitorClusters, findCoverageGaps } from '../services/communityMapService';

const router = express.Router();

const requireTenant = (req: any) => {
  const tenant = req.tenant as { businessId?: string; locationId?: string | null } | undefined;
  if (!tenant?.businessId) throw new Error('Missing tenant context');
  return tenant;
};

/**
 * GET /api/competitive/competitors
 */
router.get('/competitors', async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const competitors = await prisma.competitor.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    res.json({ success: true, competitors });
  } catch (err: any) {
    res.status(err.message === 'Missing tenant context' ? 400 : 500).json({ error: err.message || 'Failed to list competitors' });
  }
});

/**
 * POST /api/competitive/competitors
 * Owner/Admin: manually add a competitor by Place ID
 * Body: { placeId, name?, locationIdInternal? }
 */
router.post('/competitors', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const placeId = String(req.body?.placeId || '').trim();
    if (!placeId) return res.status(400).json({ error: 'placeId is required' });

    const name = String(req.body?.name || '').trim() || placeId;
    const locationIdInternal = req.body?.locationIdInternal ? String(req.body.locationIdInternal) : (tenant as any).locationId || null;

    const row = await prisma.competitor.upsert({
      where: { businessId_placeId: { businessId: tenant.businessId!, placeId } },
      create: {
        businessId: tenant.businessId!,
        locationId: locationIdInternal,
        placeId,
        name,
        status: 'active',
        source: 'manual',
        locked: true,
      },
      update: {
        status: 'active',
        source: 'manual',
        locked: true,
      },
    });

    res.json({ success: true, competitor: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create competitor' });
  }
});

/**
 * PATCH /api/competitive/competitors/:id
 * Body: { status?, locked? }
 */
router.patch('/competitors/:id', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'id is required' });

    const status = req.body?.status ? String(req.body.status) : undefined;
    const locked = typeof req.body?.locked === 'boolean' ? req.body.locked : undefined;

    const updated = await prisma.competitor.update({
      where: { id },
      data: {
        ...(typeof status === 'string' ? { status } : {}),
        ...(typeof locked === 'boolean' ? { locked } : {}),
      },
    });

    if (updated.businessId !== tenant.businessId) return res.status(403).json({ error: 'Forbidden' });
    res.json({ success: true, competitor: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update competitor' });
  }
});

/**
 * DELETE /api/competitive/competitors/:id
 */
router.delete('/competitors/:id', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ error: 'id is required' });

    const existing = await prisma.competitor.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await prisma.competitor.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete competitor' });
  }
});

/**
 * POST /api/competitive/discover
 * Owner/Admin: discover competitors via Places API
 * Body: { query, radiusMiles?, limit?, locationIdInternal? }
 */
router.post('/discover', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'query is required' });

    let locationIdInternal =
      req.body?.locationIdInternal ? String(req.body.locationIdInternal) : (tenant as any).locationId || null;
    
    // If still no locationId, try to get the default location for this business
    if (!locationIdInternal) {
      try {
        const defaultLoc = await prisma.location.findFirst({
          where: { businessId: tenant.businessId },
          orderBy: { createdAt: 'asc' },
        });
        locationIdInternal = defaultLoc?.id || null;
      } catch {
        locationIdInternal = null;
      }
    }
    
    if (!locationIdInternal) return res.status(400).json({ error: 'locationIdInternal is required. No default location found for this business. Please provide locationId in request body or connect a Google Business Profile location.' });

    const radiusMiles = req.body?.radiusMiles ? Number(req.body.radiusMiles) : undefined;
    const limit = req.body?.limit ? Number(req.body.limit) : undefined;

    const out = await discoverCompetitors({
      businessId: tenant.businessId!,
      locationIdInternal,
      query,
      radiusMiles,
      limit,
    });

    res.json({ success: true, ...out });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to discover competitors' });
  }
});

/**
 * POST /api/competitive/refresh
 * Owner/Admin: refresh snapshots + derived insights for a competitor or all.
 * Body: { competitorId? }
 */
router.post('/refresh', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const competitorId = req.body?.competitorId ? String(req.body.competitorId) : null;

    const competitors = competitorId
      ? await prisma.competitor.findMany({ where: { businessId: tenant.businessId, id: competitorId } })
      : await prisma.competitor.findMany({ where: { businessId: tenant.businessId, status: 'active' }, take: 100 });

    const results: any[] = [];
    for (const c of competitors) {
      try {
        const { snapshot } = await ingestCompetitorSnapshot({ businessId: tenant.businessId!, competitorId: c.id });
        const velocity = await computeCompetitorVelocity({ businessId: tenant.businessId!, competitorId: c.id, windowDays: 7 });
        const themes = await recomputeCompetitorThemes({ businessId: tenant.businessId!, competitorId: c.id, windowDays: 30 });
        const overlap = await recomputeCompetitorKeywordOverlap({ businessId: tenant.businessId!, competitorId: c.id });
        results.push({ competitorId: c.id, ok: true, snapshot, velocity, themesCount: themes.themes.length, overlap });
      } catch (e: any) {
        results.push({ competitorId: c.id, ok: false, error: e.message || String(e) });
      }
    }

    res.json({ success: true, count: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to refresh competitors' });
  }
});

/**
 * GET /api/competitive/insights?competitorId=...&windowDays=7
 */
router.get('/insights', async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const competitorId = String((req.query as any)?.competitorId || '').trim();
    if (!competitorId) return res.status(400).json({ error: 'competitorId is required' });
    const windowDays = (req.query as any)?.windowDays ? Number((req.query as any).windowDays) : 7;

    const competitor = await prisma.competitor.findFirst({ where: { id: competitorId, businessId: tenant.businessId } });
    if (!competitor) return res.status(404).json({ error: 'Competitor not found' });

    const latest = await prisma.competitorSnapshot.findFirst({
      where: { businessId: tenant.businessId, competitorId },
      orderBy: { capturedAt: 'desc' },
    });

    const velocity = await computeCompetitorVelocity({ businessId: tenant.businessId!, competitorId, windowDays });
    const themes = await prisma.competitorTheme.findMany({
      where: { businessId: tenant.businessId, competitorId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const overlap = await recomputeCompetitorKeywordOverlap({ businessId: tenant.businessId!, competitorId });

    res.json({
      success: true,
      competitor,
      latestSnapshot: latest,
      velocity,
      themes,
      keywordOverlap: overlap,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load insights' });
  }
});

/**
 * GET /api/competitive/business-location
 * Get business location coordinates for map center
 */
router.get('/business-location', async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const location = await prisma.location.findFirst({
      where: { id: (tenant as any).locationId || undefined, businessId: tenant.businessId },
      orderBy: { createdAt: 'asc' },
    });
    
    if (!location) {
      return res.json({ success: true, coordinates: null });
    }
    
    const googleAccountId = String(location.googleAccountId || process.env.GOOGLE_ACCOUNT_ID || '').replace(/^accounts\//, '');
    const googleLocationIdRaw = String(location.googleLocationId || process.env.GOOGLE_LOCATION_ID || '');
    const googleLocationId = googleLocationIdRaw.startsWith('locations/') ? googleLocationIdRaw : `locations/${googleLocationIdRaw}`;
    
    try {
      const coords = await getLocationDetails({ accountId: googleAccountId, locationId: googleLocationId });
      res.json({ success: true, coordinates: { latitude: coords.latitude, longitude: coords.longitude } });
    } catch (err: any) {
      console.warn('Could not fetch business location coordinates:', err.message);
      res.json({ success: true, coordinates: null });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get business location' });
  }
});

/**
 * POST /api/competitive/refresh-coordinates
 * Owner/Admin: refresh coordinates for all competitors (or a specific competitor)
 * Body: { competitorId? } - if competitorId is provided, only refresh that one
 */
router.post('/refresh-coordinates', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    if (!isPlacesConfigured()) {
      return res.status(400).json({ error: 'GOOGLE_PLACES_API_KEY is not configured' });
    }

    const competitorId = req.body?.competitorId ? String(req.body.competitorId).trim() : null;

    const where: any = { businessId: tenant.businessId };
    if (competitorId) {
      where.id = competitorId;
    }

    const competitors = await prisma.competitor.findMany({
      where,
      select: { id: true, placeId: true, name: true, locked: true },
    });

    if (competitors.length === 0) {
      return res.json({ success: true, updated: 0, message: 'No competitors found' });
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const competitor of competitors) {
      try {
        const details = await getPlaceDetails({
          placeId: competitor.placeId,
          fieldMask: 'location',
        });

        const location = (details as any).location || {};
        const latitude = typeof location.latitude === 'number' ? location.latitude : null;
        const longitude = typeof location.longitude === 'number' ? location.longitude : null;

        if (latitude != null && longitude != null) {
          await prisma.competitor.update({
            where: { id: competitor.id },
            data: { latitude, longitude },
          });
          updated += 1;
        } else {
          skipped += 1;
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err: any) {
        errors.push(`${competitor.name || competitor.placeId}: ${err.message || 'Failed to fetch coordinates'}`);
      }
    }

    res.json({
      success: true,
      updated,
      skipped,
      total: competitors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to refresh coordinates' });
  }
});

/**
 * Discover community points (employers, hospitals, schools)
 * POST /api/competitive/community/discover
 */
router.post('/community/discover', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const { location, radiusMiles = 20, forceRefresh = false } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'location is required (address string or {latitude, longitude})' });
    }

    let locationCoords: { latitude: number; longitude: number };
    if (typeof location === 'string') {
      const { geocodeAddress } = await import('../utils/geocoding');
      const geocode = await geocodeAddress(location);
      locationCoords = { latitude: geocode.latitude, longitude: geocode.longitude };
    } else if (location.latitude && location.longitude) {
      locationCoords = { latitude: location.latitude, longitude: location.longitude };
    } else {
      return res.status(400).json({ error: 'Invalid location format' });
    }

    if (!tenant.businessId) return res.status(400).json({ error: 'Missing businessId' });
    const result = await discoverCommunityPoints(
      tenant.businessId,
      locationCoords,
      radiusMiles,
      forceRefresh
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Failed to discover community points:', error);
    res.status(500).json({
      error: error.message || 'Failed to discover community points',
    });
  }
});

/**
 * Get community points for business
 * GET /api/competitive/community/points
 */
router.get('/community/points', async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    if (!tenant.businessId) return res.status(400).json({ error: 'Missing businessId' });
    const points = await getCommunityPoints(tenant.businessId);

    res.json({
      success: true,
      points,
      count: points.length,
    });
  } catch (error: any) {
    console.error('Failed to get community points:', error);
    res.status(500).json({
      error: error.message || 'Failed to get community points',
    });
  }
});

/**
 * Get demographic data
 * GET /api/competitive/community/demographics
 */
router.get('/community/demographics', async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    const { location, radiusMiles = 20 } = req.query;

    if (!location) {
      return res.status(400).json({ error: 'location query parameter is required' });
    }

    if (!tenant.businessId) return res.status(400).json({ error: 'Missing businessId' });
    const data = await getDemographicData(
      tenant.businessId,
      String(location),
      Number(radiusMiles)
    );

    res.json({
      success: true,
      demographics: data,
      count: data.length,
    });
  } catch (error: any) {
    console.error('Failed to get demographic data:', error);
    res.status(500).json({
      error: error.message || 'Failed to get demographic data',
    });
  }
});

/**
 * Get complete map data (all layers)
 * GET /api/competitive/community/map-data
 */
router.get('/community/map-data', async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    if (!tenant.businessId) return res.status(400).json({ error: 'Missing businessId' });
    const { location, radiusMiles = 20 } = req.query;

    if (!location) {
      // Try to get business location
      const businessLocation = await prisma.location.findFirst({
        where: { businessId: tenant.businessId },
        orderBy: { createdAt: 'asc' },
      });
      if (!businessLocation || !businessLocation.address) {
        return res.status(400).json({ error: 'location is required' });
      }
      const mapData = await prepareMapData(tenant.businessId, String(businessLocation.address), Number(radiusMiles));
      return res.json({ success: true, ...mapData });
    }

    const mapData = await prepareMapData(tenant.businessId, String(location), Number(radiusMiles));

    res.json({
      success: true,
      ...mapData,
    });
  } catch (error: any) {
    console.error('Failed to get map data:', error);
    res.status(500).json({
      error: error.message || 'Failed to get map data',
    });
  }
});

/**
 * Refresh community data
 * POST /api/competitive/community/refresh
 */
router.post('/community/refresh', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    if (!tenant.businessId) return res.status(400).json({ error: 'Missing businessId' });
    const { location, radiusMiles = 20 } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'location is required' });
    }

    let locationCoords: { latitude: number; longitude: number };
    if (typeof location === 'string') {
      const { geocodeAddress } = await import('../utils/geocoding');
      const geocode = await geocodeAddress(location);
      locationCoords = { latitude: geocode.latitude, longitude: geocode.longitude };
    } else if (location.latitude && location.longitude) {
      locationCoords = { latitude: location.latitude, longitude: location.longitude };
    } else {
      return res.status(400).json({ error: 'Invalid location format' });
    }

    // Refresh both community points and demographics
    const [pointsResult] = await Promise.all([
      discoverCommunityPoints(tenant.businessId, locationCoords, radiusMiles, true),
      getDemographicData(tenant.businessId, locationCoords, radiusMiles),
    ]);

    res.json({
      success: true,
      message: 'Community data refreshed',
      pointsDiscovered: pointsResult.upserted,
    });
  } catch (error: any) {
    console.error('Failed to refresh community data:', error);
    res.status(500).json({
      error: error.message || 'Failed to refresh community data',
    });
  }
});

/**
 * Get market opportunity analysis
 * GET /api/competitive/community/opportunities
 */
router.get('/community/opportunities', async (req, res) => {
  try {
    const tenant = requireTenant(req as any);
    if (!tenant.businessId) return res.status(400).json({ error: 'Missing businessId' });
    const { location, radiusMiles = 20 } = req.query;

    if (!location) {
      return res.status(400).json({ error: 'location query parameter is required' });
    }

    let locationCoords: { latitude: number; longitude: number };
    const locationStr = String(location);
    const { geocodeAddress } = await import('../utils/geocoding');
    const geocode = await geocodeAddress(locationStr);
    locationCoords = { latitude: geocode.latitude, longitude: geocode.longitude };

    const opportunities = await identifyCompetitorClusters(
      tenant.businessId,
      locationCoords,
      Number(radiusMiles)
    );

    const gaps = await findCoverageGaps(
      tenant.businessId,
      locationCoords,
      Number(radiusMiles)
    );

    res.json({
      success: true,
      opportunities,
      coverageGaps: gaps,
    });
  } catch (error: any) {
    console.error('Failed to get opportunities:', error);
    res.status(500).json({
      error: error.message || 'Failed to get opportunities',
    });
  }
});

export default router;


