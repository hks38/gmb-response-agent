import express from 'express';
import {
  createOrUpdatePractice,
  findAreasWithinRadius,
  getPracticeAreas,
  getAreaById,
} from '../services/geographicService';
import { fetchKeywordCostsForPractice } from '../services/keywordCostService';
import { prisma } from '../db/client';

const router = express.Router();

/**
 * Create or update a practice location
 * POST /api/geographic/practice
 */
router.post('/practice', async (req, res) => {
  try {
    const { name, address, radiusMiles = 20 } = req.body;

    if (!name || !address) {
      return res.status(400).json({
        error: 'Name and address are required',
      });
    }

    const result = await createOrUpdatePractice(name, address, radiusMiles);

    res.json({
      success: true,
      practice: result,
    });
  } catch (error: any) {
    console.error('Failed to create/update practice:', error);
    res.status(500).json({
      error: error.message || 'Failed to create/update practice',
    });
  }
});

/**
 * Get all practices
 * GET /api/geographic/practices
 */
router.get('/practices', async (req, res) => {
  try {
    const practices = await prisma.practice.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            areas: true,
            analyses: true,
          },
        },
      },
    });

    res.json(practices);
  } catch (error: any) {
    console.error('Failed to get practices:', error);
    res.status(500).json({
      error: error.message || 'Failed to get practices',
    });
  }
});

/**
 * Get a specific practice
 * GET /api/geographic/practices/:id
 */
router.get('/practices/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const practice = await prisma.practice.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            areas: true,
            analyses: true,
          },
        },
      },
    });

    if (!practice) {
      return res.status(404).json({ error: 'Practice not found' });
    }

    res.json(practice);
  } catch (error: any) {
    console.error('Failed to get practice:', error);
    res.status(500).json({
      error: error.message || 'Failed to get practice',
    });
  }
});

/**
 * Find areas within radius for a practice
 * POST /api/geographic/areas/find
 */
router.post('/areas/find', async (req, res) => {
  try {
    const { practiceId, forceRefresh = false } = req.body;

    if (!practiceId) {
      return res.status(400).json({
        error: 'practiceId is required',
      });
    }

    const areas = await findAreasWithinRadius(practiceId, forceRefresh);

    res.json({
      success: true,
      areas,
      count: areas.length,
    });
  } catch (error: any) {
    console.error('Failed to find areas:', error);
    res.status(500).json({
      error: error.message || 'Failed to find areas',
    });
  }
});

/**
 * Get all areas for a practice
 * GET /api/geographic/areas?practiceId=xxx
 */
router.get('/areas', async (req, res) => {
  try {
    const { practiceId } = req.query;

    if (!practiceId) {
      return res.status(400).json({
        error: 'practiceId is required',
      });
    }

    const areas = await getPracticeAreas(practiceId as string);

    res.json({
      success: true,
      areas,
      count: areas.length,
    });
  } catch (error: any) {
    console.error('Failed to get areas:', error);
    res.status(500).json({
      error: error.message || 'Failed to get areas',
    });
  }
});

/**
 * Get a specific area by ID
 * GET /api/geographic/areas/:id
 */
router.get('/areas/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const area = await getAreaById(id);

    if (!area) {
      return res.status(404).json({ error: 'Area not found' });
    }

    res.json(area);
  } catch (error: any) {
    console.error('Failed to get area:', error);
    res.status(500).json({
      error: error.message || 'Failed to get area',
    });
  }
});

/**
 * Run full analysis for a practice
 * POST /api/geographic/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const { practiceId, forceRefresh = false } = req.body;

    if (!practiceId) {
      return res.status(400).json({
        error: 'practiceId is required',
      });
    }

    // Step 1: Find areas within radius
    console.log('Finding areas within radius...');
    const areas = await findAreasWithinRadius(practiceId, forceRefresh);

    // Step 2: Fetch keyword costs for all areas
    console.log('Fetching keyword costs...');
    await fetchKeywordCostsForPractice(practiceId, forceRefresh);

    // Step 3: Analyze and rank areas
    console.log('Analyzing opportunities...');
    const analysis = await analyzeOpportunities(practiceId);

    // Step 4: Save analysis
    const savedAnalysis = await prisma.analysis.create({
      data: {
        practiceId,
        topAreas: JSON.stringify(analysis.rankedAreas),
        summary: analysis.summary,
      },
    });

    res.json({
      success: true,
      analysis: {
        id: savedAnalysis.id,
        ...analysis,
      },
      areasFound: areas.length,
    });
  } catch (error: any) {
    console.error('Failed to run analysis:', error);
    res.status(500).json({
      error: error.message || 'Failed to run analysis',
    });
  }
});

/**
 * Get analysis results
 * GET /api/geographic/analysis/:id
 */
router.get('/analysis/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const analysis = await prisma.analysis.findUnique({
      where: { id },
      include: {
        practice: true,
      },
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json({
      ...analysis,
      topAreas: JSON.parse(analysis.topAreas),
    });
  } catch (error: any) {
    console.error('Failed to get analysis:', error);
    res.status(500).json({
      error: error.message || 'Failed to get analysis',
    });
  }
});

/**
 * Analyze opportunities and rank areas
 */
async function analyzeOpportunities(practiceId: string) {
  const areas = await prisma.area.findMany({
    where: { practiceId },
    include: {
      keywordCosts: true,
    },
  });

  const areaScores = areas.map(area => {
    const costs = area.keywordCosts;
    if (costs.length === 0) {
      return {
        areaId: area.id,
        areaName: area.name,
        score: 0,
        avgCpc: 0,
        totalVolume: 0,
        keywordCount: 0,
        lowCompetitionCount: 0,
      };
    }

    const avgCpc = costs.reduce((sum, c) => sum + c.avgCpc, 0) / costs.length;
    const totalVolume = costs.reduce((sum, c) => sum + c.searchVolume, 0);
    const lowCompetitionCount = costs.filter(c => c.competition === 'LOW').length;

    // Calculate opportunity score
    // Higher volume + Lower CPC + Lower competition = Better score
    const volumeScore = Math.min(totalVolume / 10000, 1) * 0.4; // Normalize to 0-1, weight 40%
    const cpcScore = Math.max(0, (10 - avgCpc) / 10) * 0.4; // Lower CPC is better, weight 40%
    const competitionScore = (lowCompetitionCount / costs.length) * 0.2; // Weight 20%

    const opportunityScore = volumeScore + cpcScore + competitionScore;

    return {
      areaId: area.id,
      areaName: area.name,
      city: area.city,
      state: area.state,
      latitude: area.latitude,
      longitude: area.longitude,
      distanceMiles: area.distanceMiles,
      score: Math.round(opportunityScore * 100) / 100,
      avgCpc: Math.round(avgCpc * 100) / 100,
      totalVolume,
      keywordCount: costs.length,
      lowCompetitionCount,
      competitionRatio: Math.round((lowCompetitionCount / costs.length) * 100) / 100,
    };
  });

  // Sort by opportunity score (descending)
  const rankedAreas = areaScores.sort((a, b) => b.score - a.score);

  // Generate summary
  const top3 = rankedAreas.slice(0, 3);
  const summary = `Analysis complete. Found ${areas.length} areas within radius. ` +
    `Top opportunities: ${top3.map(a => a.areaName).join(', ')}. ` +
    `Average CPC ranges from $${Math.min(...rankedAreas.map(a => a.avgCpc)).toFixed(2)} ` +
    `to $${Math.max(...rankedAreas.map(a => a.avgCpc)).toFixed(2)}.`;

  return {
    rankedAreas,
    summary,
  };
}

export default router;


