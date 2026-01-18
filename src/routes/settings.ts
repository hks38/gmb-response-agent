import express from 'express';
import { z } from 'zod';
import { getBusinessSettings, updateBusinessSettings } from '../services/settingsService';
import { reloadScheduler } from '../jobs/scheduler';
import { requireRole } from '../middleware/rbac';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const tenant = (_req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ success: false, error: 'Missing tenant context' });
    const settings = await getBusinessSettings(tenant.businessId);
    res.json({ success: true, settings });
  } catch (err: any) {
    console.error('Failed to load settings', err);
    res.status(500).json({ success: false, error: 'Failed to load settings', message: err.message });
  }
});

const PatchSchema = z.object({
  businessName: z.string().min(1).optional(),
  businessLocation: z.string().min(1).optional(),
  websiteUrl: z.string().min(1).optional(),
  businessPhone: z.string().optional().nullable(),
  businessEmail: z.string().optional().nullable(),

  emailTo: z.string().min(1).optional(),

  schedulerEnabled: z.boolean().optional(),
  schedulerTz: z.string().min(1).optional(),
  dailyReviewsCron: z.string().min(1).optional(),
  twiceWeeklyPostCron: z.string().min(1).optional(),
  monthlyReportCron: z.string().min(1).optional(),
  avoidRepeatLastNPosts: z.number().int().min(0).max(50).optional(),

  reviewMinWords: z.number().int().min(0).max(400).optional(),
  reviewMaxWords: z.number().int().min(10).max(400).optional(),
  reviewSignature: z.string().min(1).optional(),
  reviewSignatureVariantsJson: z.string().optional().nullable(),

  gmbPostMaxWords: z.number().int().min(10).max(400).optional(),

  bannedPhrases: z
    .array(z.string().transform((s) => String(s).trim()).refine((s) => s.length > 0))
    .max(500)
    .optional(),

  defaultUseSerpApiRankings: z.boolean().optional(),
  monthlyReportUseSerpApiRankings: z.boolean().optional(),
});

router.put('/', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ success: false, error: 'Missing tenant context' });
    const patch = PatchSchema.parse(req.body || {});

    // basic sanity: min <= max when both are present
    if (
      typeof patch.reviewMinWords === 'number' &&
      typeof patch.reviewMaxWords === 'number' &&
      patch.reviewMinWords > patch.reviewMaxWords
    ) {
      return res.status(400).json({ success: false, error: 'reviewMinWords must be <= reviewMaxWords' });
    }

    const settings = await updateBusinessSettings(tenant.businessId, patch as any);

    // Apply scheduling changes immediately
    try {
      await reloadScheduler();
    } catch (e: any) {
      console.warn('Scheduler reload failed (non-fatal):', e.message);
    }

    res.json({ success: true, settings });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ success: false, error: 'Invalid settings', details: err.errors });
    }
    console.error('Failed to update settings', err);
    res.status(500).json({ success: false, error: 'Failed to update settings', message: err.message });
  }
});

export default router;



