import express from 'express';
import { analyzeGMBProfile } from '../services/gmbProfileAnalyzer';

const router = express.Router();

/**
 * GET /api/analysis/profile
 * Analyze GMB profile and return AI-powered recommendations
 */
router.get('/profile', async (req, res) => {
  try {
    const accountId = process.env.GOOGLE_ACCOUNT_ID;
    const locationId = process.env.GOOGLE_LOCATION_ID;

    if (!accountId || !locationId) {
      return res.status(400).json({
        error: 'Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID in environment variables',
      });
    }

    const analysis = await analyzeGMBProfile(accountId, locationId);

    res.json(analysis);
  } catch (error: any) {
    console.error('Error analyzing profile:', error);
    res.status(500).json({
      error: 'Failed to analyze profile',
      message: error.message,
    });
  }
});

export default router;

