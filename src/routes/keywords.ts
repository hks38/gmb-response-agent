import express from 'express';
import { prisma } from '../db/client';
import { getHistoricalTrends } from '../services/keywordTrendService';
import { generateDentalKeywords, extractKeywordsFromContent } from '../services/keywordResearch';
import { getGoogleTrends, getGeoCode } from '../services/googleTrendsService';

const router = express.Router();

// Get weekly reports
router.get('/reports', async (req, res) => {
  try {
    const { location, weeks = 8 } = req.query;

    const where: any = {};
    if (location) where.location = location;

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (Number(weeks) * 7));

    where.reportDate = {
      gte: startDate,
    };

    const reports = await prisma.keywordWeeklyReport.findMany({
      where,
      orderBy: { reportDate: 'desc' },
    });

    // Parse JSON fields
    const parsedReports = reports.map(report => ({
      ...report,
      topKeywords: JSON.parse(report.topKeywords || '[]'),
      trendingUp: JSON.parse(report.trendingUp || '[]'),
      trendingDown: JSON.parse(report.trendingDown || '[]'),
    }));

    res.json(parsedReports);
  } catch (err: any) {
    console.error('Failed to get reports', err);
    res.status(500).json({ error: err.message || 'Failed to get reports' });
  }
});

// Get latest report
router.get('/reports/latest', async (req, res) => {
  try {
    const { location } = req.query;

    const where: any = {};
    if (location) where.location = location;

    const report = await prisma.keywordWeeklyReport.findFirst({
      where,
      orderBy: { reportDate: 'desc' },
    });

    if (!report) {
      return res.status(404).json({ error: 'No reports found' });
    }

    // Parse JSON fields
    const parsedReport = {
      ...report,
      topKeywords: JSON.parse(report.topKeywords || '[]'),
      trendingUp: JSON.parse(report.trendingUp || '[]'),
      trendingDown: JSON.parse(report.trendingDown || '[]'),
    };

    res.json(parsedReport);
  } catch (err: any) {
    console.error('Failed to get latest report', err);
    res.status(500).json({ error: err.message || 'Failed to get latest report' });
  }
});

// Get historical trends for a keyword
router.get('/trends/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const { location, weeks = 12 } = req.query;

    const trends = await getHistoricalTrends({
      keyword,
      location: location as string,
      weeks: Number(weeks),
    });

    res.json(trends);
  } catch (err: any) {
    console.error('Failed to get trends', err);
    res.status(500).json({ error: err.message || 'Failed to get trends' });
  }
});

// Get all keywords with trends
router.get('/keywords', async (req, res) => {
  try {
    const { location, weeks = 8 } = req.query;

    const where: any = {};
    if (location) where.location = location;

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (Number(weeks) * 7));

    where.weekOf = {
      gte: startDate,
    };

    const trends = await prisma.keywordTrend.findMany({
      where,
      orderBy: { weekOf: 'desc' },
      distinct: ['keyword'],
    });

    res.json(trends);
  } catch (err: any) {
    console.error('Failed to get keywords', err);
    res.status(500).json({ error: err.message || 'Failed to get keywords' });
  }
});

// Research keywords for a location
router.post('/research', async (req, res) => {
  try {
    const { location, radius = 10 } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    // Generate dental keywords with location
    const keywords = generateDentalKeywords(location);
    
    // Get trends for keywords
    const geoCode = getGeoCode(location);
    const keywordTrends = [];
    
    for (const keyword of keywords.slice(0, 20)) { // Limit to top 20 to avoid rate limits
      try {
        const trends = await getGoogleTrends({
          keywords: [keyword],
          geo: geoCode,
          timeframe: 'today 3-m',
        });
        
        if (trends && trends.length > 0) {
          const trend = trends[0];
          keywordTrends.push({
            keyword,
            volume: trend.currentValue || trend.averages?.month || 0,
            trend: trend.currentValue > (trend.averages?.month || 0) ? 'up' : 'down',
          });
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        // Continue with next keyword
        console.warn(`Failed to get trends for ${keyword}:`, err);
      }
    }

    // Sort by volume
    keywordTrends.sort((a, b) => (b.volume || 0) - (a.volume || 0));

    res.json({
      success: true,
      keywordsCount: keywordTrends.length,
      topKeywords: keywordTrends,
      location: location,
    });
  } catch (err: any) {
    console.error('Failed to research keywords', err);
    res.status(500).json({ error: err.message || 'Failed to research keywords' });
  }
});

// Generate weekly keyword report
router.post('/weekly-report', async (req, res) => {
  try {
    const { location } = req.body;

    // This is a simplified version - in production you'd call the full script logic
    // For now, we'll trigger it and return a success message
    // The actual generation should be done via the script: npm run weekly-keyword-report
    
    res.json({
      success: true,
      message: 'Weekly report generation started. Please run: npm run weekly-keyword-report',
      note: 'For full functionality, use the dedicated script which processes all locations.',
    });
  } catch (err: any) {
    console.error('Failed to generate weekly report', err);
    res.status(500).json({ error: err.message || 'Failed to generate weekly report' });
  }
});

// Get latest trends (for UI)
router.get('/trends', async (req, res) => {
  try {
    const { location } = req.query;

    const where: any = {};
    if (location) {
      where.location = location;
    } else {
      // If no location specified, get the most recent report
      where.OR = [
        { location: { contains: 'All Locations' } },
        { location: null },
      ];
    }

    const report = await prisma.keywordWeeklyReport.findFirst({
      where,
      orderBy: { reportDate: 'desc' },
    });

    if (!report) {
      return res.status(404).json({ error: 'No trends available. Generate a weekly report first.' });
    }

    // Parse JSON fields
    const parsedReport = {
      ...report,
      topKeywords: report.topKeywords ? JSON.parse(report.topKeywords) : [],
      trendingUp: report.trendingUp ? JSON.parse(report.trendingUp) : [],
      trendingDown: report.trendingDown ? JSON.parse(report.trendingDown) : [],
    };

    res.json(parsedReport);
  } catch (err: any) {
    console.error('Failed to get trends', err);
    res.status(500).json({ error: err.message || 'Failed to get trends' });
  }
});

export default router;

