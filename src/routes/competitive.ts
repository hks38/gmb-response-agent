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

export default router;


