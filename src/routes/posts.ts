import express from 'express';
import { createLocalPost, listLocalPosts } from '../services/googlePosts';
import { generateSEOPost } from '../services/seoPostGenerator';
import { generateSmartPost } from '../services/smartPostGenerator';
import { requireRole } from '../middleware/rbac';
import { getBusinessSettings } from '../services/settingsService';
import { runComplianceGuard } from '../services/complianceGuard';
import { logAuditEvent } from '../services/auditLogService';

const router = express.Router();

// Create a new SEO-optimized post
router.post('/', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const { topic, postType, callToAction, ctaUrl } = req.body;
    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';

    if (!accountId || !locationId) {
      return res.status(400).json({ error: 'Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID' });
    }

    // Generate SEO-optimized content
    const postContent = await generateSEOPost({
      topic: topic || 'General dental care and practice information',
      postType: postType || 'STANDARD',
      callToAction: callToAction || 'LEARN_MORE',
      ctaUrl: ctaUrl || process.env.WEBSITE_URL || 'https://malama.dental',
      businessId: tenant.businessId,
    });

    const settings = await getBusinessSettings(tenant.businessId);
    const bannedPhrases = settings.bannedPhrases || [];
    const compliance = runComplianceGuard({
      target: 'gmb_post',
      text: postContent.summary,
      bannedPhrases,
      allowedBusinessEmail: settings.businessEmail ?? null,
      allowedBusinessPhone: settings.businessPhone ?? null,
    });

    if (compliance.blocked) {
      return res.status(400).json({
        error: 'Post blocked by compliance guardrails',
        violations: compliance.violations,
      });
    }

    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;

    // Create the post
    const response = await createLocalPost({
      accountId,
      locationId: numericLocationId,
      businessId: tenant.businessId,
      locationIdInternal: (tenant as any).locationId || undefined,
      post: {
        languageCode: 'en-US',
        summary: compliance.sanitizedText,
        callToAction: postContent.callToAction,
        topicType: postContent.topicType,
      },
    });

    try {
      const sessionUser = (req as any).user as { userId?: string } | undefined;
      await logAuditEvent({
        businessId: tenant.businessId,
        actorUserId: sessionUser?.userId || null,
        actorRole: (tenant as any).role || null,
        action: 'POST_GMB_POST',
        targetType: 'POST',
        targetId: null,
        originalText: postContent.summary,
        sanitizedText: compliance.sanitizedText,
        violationCodes: compliance.violations.map((v) => v.code),
        metadata: {
          googlePostName: (response as any)?.name,
          state: (response as any)?.state,
        },
      });
    } catch (e: any) {
      console.warn('Audit logging failed (non-fatal):', e?.message || e);
    }

    res.json({
      success: true,
      post: response,
      content: postContent,
    });
  } catch (err: any) {
    console.error('Failed to create post', err);
    res.status(500).json({ error: err.message || 'Failed to create post' });
  }
});

// Generate a post (without posting)
router.post('/generate', async (req, res) => {
  try {
    const { topic, postType, callToAction, useWeeklyReport = true } = req.query;
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const result = await generateSmartPost({
      topic: topic as string,
      postType: (postType as any) || 'STANDARD',
      callToAction: (callToAction as any) || 'LEARN_MORE',
      ctaUrl: process.env.WEBSITE_URL || 'https://malama.dental',
      useWeeklyReport: useWeeklyReport !== 'false',
      maxPosts: 1,
      businessId: tenant.businessId,
    });

    if (result.posts.length === 0) {
      return res.status(500).json({ error: 'Failed to generate post' });
    }

    const postContent = result.posts[0];
    res.json({
      ...postContent,
      keywords: result.keywords,
      source: result.source,
    });
  } catch (err: any) {
    console.error('Failed to generate post', err);
    res.status(500).json({ error: err.message || 'Failed to generate post' });
  }
});

// Create a post (post to GMB)
router.post('/create', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const { summary, postType, callToAction, media } = req.body;
    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';

    if (!accountId || !locationId) {
      return res.status(400).json({ error: 'Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID' });
    }

    if (!summary) {
      return res.status(400).json({ error: 'Post summary is required' });
    }

    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;
    const accountIdClean = accountId.replace(/^accounts\//, '');

    const settings = await getBusinessSettings(tenant.businessId);
    const bannedPhrases = settings.bannedPhrases || [];
    const compliance = runComplianceGuard({
      target: 'gmb_post',
      text: summary,
      bannedPhrases,
      allowedBusinessEmail: settings.businessEmail ?? null,
      allowedBusinessPhone: settings.businessPhone ?? null,
    });

    if (compliance.blocked) {
      return res.status(400).json({
        error: 'Post blocked by compliance guardrails',
        violations: compliance.violations,
      });
    }

    const response = await createLocalPost({
      accountId: accountIdClean,
      locationId: numericLocationId,
      businessId: tenant.businessId,
      locationIdInternal: (tenant as any).locationId || undefined,
      post: {
        languageCode: 'en-US',
        summary: compliance.sanitizedText,
        callToAction,
        topicType: postType,
        media,
      },
    });

    try {
      const sessionUser = (req as any).user as { userId?: string } | undefined;
      await logAuditEvent({
        businessId: tenant.businessId,
        actorUserId: sessionUser?.userId || null,
        actorRole: (tenant as any).role || null,
        action: 'POST_GMB_POST',
        targetType: 'POST',
        targetId: null,
        originalText: summary,
        sanitizedText: compliance.sanitizedText,
        violationCodes: compliance.violations.map((v) => v.code),
        metadata: {
          googlePostName: (response as any)?.name,
          state: (response as any)?.state,
        },
      });
    } catch (e: any) {
      console.warn('Audit logging failed (non-fatal):', e?.message || e);
    }

    res.json({
      success: true,
      post: response,
    });
  } catch (err: any) {
    console.error('Failed to create post', err);
    res.status(500).json({ error: err.message || 'Failed to create post' });
  }
});

// List all posts
router.get('/', async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';

    if (!accountId || !locationId) {
      return res.status(400).json({ error: 'Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID' });
    }

    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;
    const accountIdClean = accountId.replace(/^accounts\//, '');

    const posts = await listLocalPosts({
      accountId: accountIdClean,
      locationId: numericLocationId,
      businessId: tenant.businessId,
      locationIdInternal: (tenant as any).locationId || undefined,
    });

    res.json(posts);
  } catch (err: any) {
    console.error('Failed to list posts', err);
    res.status(500).json({ error: err.message || 'Failed to list posts' });
  }
});

export default router;

