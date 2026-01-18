import { Router } from 'express';
import { prisma } from '../db/client';
import { requireRole } from '../middleware/rbac';
import { getBusinessSettings } from '../services/settingsService';
import { runComplianceGuard } from '../services/complianceGuard';
import { logAuditEvent } from '../services/auditLogService';

const router = Router();

const parseJsonArray = (value: string | null): any[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const computeWhyFlagged = (review: {
  status?: string;
  rating?: number | null;
  sentiment?: string | null;
  riskFlags?: any[];
  replyDraft?: string | null;
}): string[] => {
  if (review.status !== 'Needs Approval') return [];
  const why: string[] = [];
  const rating = typeof review.rating === 'number' ? review.rating : null;
  if (rating !== null && rating <= 3) why.push(`Low rating (${rating}★)`);
  if (String(review.sentiment || '').toLowerCase() === 'negative') why.push('Negative sentiment');
  const flags = Array.isArray(review.riskFlags) ? review.riskFlags : [];
  for (const f of flags) {
    if (f) why.push(`Risk flag: ${String(f)}`);
  }
  if (!String(review.replyDraft || '').trim()) why.push('No reply draft yet');
  return why;
};

const toApiReview = (review: any) => {
  const topics = parseJsonArray(review.topics);
  const suggestedActions = parseJsonArray(review.suggestedActions);
  const riskFlags = parseJsonArray(review.riskFlags);
  let replyVariants: any = null;
  try {
    replyVariants = review.replyVariantsJson ? JSON.parse(String(review.replyVariantsJson)) : null;
  } catch {
    replyVariants = null;
  }
  return {
    ...review,
    topics,
    suggestedActions,
    riskFlags,
    replyLanguageCode: review.replyLanguageCode || null,
    replyVariants,
    whyFlagged: computeWhyFlagged({
      status: review.status,
      rating: review.rating,
      sentiment: review.sentiment,
      riskFlags,
      replyDraft: review.replyDraft,
    }),
  };
};

/**
 * POST /api/reviews/bulk/approve-and-post
 * Bulk approve + post replies to Google Business Profile (OWNER/ADMIN only)
 *
 * Body: { reviewIds: number[] }
 */
router.post('/bulk/approve-and-post', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string; role?: string; locationId?: string | null } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const sessionUser = (req as any).user as { userId?: string } | undefined;
    const reviewIdsRaw = (req.body as any)?.reviewIds;
    const reviewIds: number[] = Array.isArray(reviewIdsRaw)
      ? reviewIdsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
      : [];

    if (reviewIds.length === 0) return res.status(400).json({ error: 'reviewIds must be a non-empty array of numbers' });

    const settings = await getBusinessSettings(tenant.businessId);
    const bannedPhrases = settings.bannedPhrases || [];

    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';
    if (!accountId || !locationId) {
      return res.status(400).json({ error: 'GOOGLE_ACCOUNT_ID and GOOGLE_LOCATION_ID must be set' });
    }
    const numericLocationId = locationId.startsWith('locations/') ? locationId.split('/')[1] : locationId;
    const accountIdClean = accountId.replace(/^accounts\//, '');

    const reviews = await prisma.review.findMany({
      where: { businessId: tenant.businessId, id: { in: reviewIds } },
    });
    const found = new Set(reviews.map((r) => r.id));
    const missing = reviewIds.filter((id) => !found.has(id));

    const { postReplyToReview } = await import('../services/postReply');

    const results: any[] = [];
    let posted = 0;
    let skipped = 0;
    let failed = 0;

    for (const review of reviews) {
      try {
        if (review.repliedAt || review.status === 'Replied') {
          skipped += 1;
          results.push({ id: review.id, ok: true, status: 'skipped_already_replied' });
          continue;
        }
        if (!review.replyDraft || !String(review.replyDraft).trim()) {
          failed += 1;
          results.push({ id: review.id, ok: false, error: 'missing_reply_draft' });
          continue;
        }

        const compliance = runComplianceGuard({
          target: 'review_reply',
          text: review.replyDraft,
          reviewComment: review.comment,
          bannedPhrases,
          allowedBusinessEmail: settings.businessEmail ?? null,
          allowedBusinessPhone: settings.businessPhone ?? null,
        });

        if (compliance.blocked) {
          failed += 1;
          results.push({ id: review.id, ok: false, error: 'blocked_by_compliance', violations: compliance.violations });
          continue;
        }

        try {
          await postReplyToReview({
            accountId: accountIdClean,
            locationId: numericLocationId,
            reviewId: review.reviewId,
            replyText: compliance.sanitizedText,
            businessId: tenant.businessId,
            locationIdInternal: (tenant as any).locationId || undefined,
          });
        } catch (e: any) {
          const msg = String(e?.message || '');
          // Treat 409 / "already exists" as a successful post in terms of DB state sync.
          if (msg.includes('already exists') || msg.includes('409')) {
            await prisma.review.update({
              where: { id: review.id },
              data: {
                repliedAt: new Date(),
                status: 'Replied',
                approvedAt: new Date(),
                approvedByUserId: sessionUser?.userId || null,
              },
            });

            skipped += 1;
            results.push({ id: review.id, ok: true, status: 'already_replied_on_google' });
            continue;
          }
          throw e;
        }

        await prisma.review.update({
          where: { id: review.id },
          data: {
            repliedAt: new Date(),
            status: 'Replied',
            replyDraft: compliance.sanitizedText,
            approvedAt: new Date(),
            approvedByUserId: sessionUser?.userId || null,
          },
        });

        try {
          await logAuditEvent({
            businessId: tenant.businessId,
            actorUserId: sessionUser?.userId || null,
            actorRole: (tenant as any).role || null,
            action: 'POST_REVIEW_REPLY',
            targetType: 'REVIEW',
            targetId: review.id,
            originalText: String(review.replyDraft || ''),
            sanitizedText: compliance.sanitizedText,
            violationCodes: compliance.violations.map((v) => v.code),
            metadata: {
              googleReviewId: review.reviewId,
              accountId: accountIdClean,
              locationId: numericLocationId,
              bulk: true,
            },
          });
        } catch (e: any) {
          // non-fatal
        }

        posted += 1;
        results.push({ id: review.id, ok: true, status: 'posted' });
        
        // Add delay between posts to avoid Google API rate limiting
        // Wait 1.5 seconds before posting next reply (except for the last one)
        const remainingCount = reviews.length - (posted + skipped + failed);
        if (remainingCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (e: any) {
        failed += 1;
        results.push({ id: review.id, ok: false, error: e?.message || 'failed_to_post' });
        
        // Add delay even on error to avoid rate limiting on retry scenarios
        const remainingCount = reviews.length - (posted + skipped + failed);
        if (remainingCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }

    for (const id of missing) {
      failed += 1;
      results.push({ id, ok: false, error: 'not_found' });
    }

    res.json({
      success: true,
      counts: { posted, skipped, failed, total: reviewIds.length },
      results,
    });
  } catch (err: any) {
    console.error('Failed bulk approve+post', err);
    res.status(500).json({ error: 'Failed bulk approve+post', message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { status, sentiment, rating } = req.query;

    const where: any = {};
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    where.businessId = tenant.businessId;
    if (status) where.status = status;
    if (sentiment) where.sentiment = sentiment;
    if (rating) where.rating = Number(rating);

    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createTime: 'desc' },
    });

    // Deserialize JSON strings back to arrays for frontend
    // Also ensure status is synced: if repliedAt is set, status should be 'Replied'
    const reviewsWithParsedArrays = reviews.map((review) => {
      const fixedStatus = review.repliedAt ? 'Replied' : review.status;
      return toApiReview({ ...review, status: fixedStatus });
    });

    res.json(reviewsWithParsedArrays);
  } catch (err: any) {
    console.error('Failed to list reviews', err);
    res.status(500).json({ error: 'Failed to list reviews', message: err?.message || String(err) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const id = Number(req.params.id);
    const review = await prisma.review.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!review) return res.status(404).json({ error: 'Not found' });
    
    const reviewWithParsedArrays = toApiReview(review);
    
    res.json(reviewWithParsedArrays);
  } catch (err) {
    console.error('Failed to fetch review', err);
    res.status(500).json({ error: 'Failed to fetch review' });
  }
});

/**
 * PATCH /api/reviews/:id/assign
 * Assign/unassign a review to a staff user.
 *
 * Body: { assignedToUserId: string | null }
 */
router.patch('/:id/assign', async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string; role?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const sessionUser = (req as any).user as { userId?: string } | undefined;
    if (!sessionUser?.userId) return res.status(401).json({ error: 'Not authenticated' });

    const id = Number(req.params.id);
    const assignedToUserIdRaw = (req.body as any)?.assignedToUserId;
    const assignedToUserId = assignedToUserIdRaw === null ? null : String(assignedToUserIdRaw || '');

    const existing = await prisma.review.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const role = String((tenant as any).role || '').toUpperCase();
    const isAdmin = role === 'OWNER' || role === 'ADMIN';

    if (!isAdmin) {
      // STAFF: only allow assigning to self (or unassign if already self)
      if (assignedToUserId && assignedToUserId !== sessionUser.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    if (assignedToUserId) {
      const membership = await prisma.businessMembership.findUnique({
        where: { userId_businessId: { userId: assignedToUserId, businessId: tenant.businessId } },
      });
      if (!membership) return res.status(400).json({ error: 'assignedToUserId is not a member of this business' });
    }

    const updated = await prisma.review.update({
      where: { id },
      data: {
        assignedToUserId: assignedToUserId || null,
        assignedAt: assignedToUserId ? new Date() : null,
      },
    });
    
    res.json(toApiReview(updated));
  } catch (err: any) {
    console.error('Failed to assign review', err);
    res.status(500).json({ error: 'Failed to assign review', message: err.message });
  }
});

/**
 * GET /api/reviews/:id/versions
 * List reply versions for a review (newest first)
 */
router.get('/:id/versions', async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const id = Number(req.params.id);
    const review = await prisma.review.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!review) return res.status(404).json({ error: 'Not found' });

    const versions = await prisma.reviewReplyVersion.findMany({
      where: { businessId: tenant.businessId, reviewId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { createdBy: true },
    });

    res.json({
      success: true,
      versions: versions.map((v) => ({
        id: v.id,
        reviewId: v.reviewId,
        businessId: v.businessId,
        text: v.text,
        source: v.source,
        note: v.note,
        diffBaseVersionId: v.diffBaseVersionId,
        createdByUserId: v.createdByUserId,
        createdBy: v.createdBy ? { id: v.createdBy.id, email: v.createdBy.email, name: v.createdBy.name } : null,
        createdAt: v.createdAt,
      })),
    });
  } catch (err: any) {
    console.error('Failed to list versions', err);
    res.status(500).json({ error: 'Failed to list versions', message: err.message });
  }
});

/**
 * POST /api/reviews/:id/versions/:versionId/restore
 * Restore a prior version as the current replyDraft (creates a new version row).
 */
router.post('/:id/versions/:versionId/restore', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const sessionUser = (req as any).user as { userId?: string } | undefined;
    const id = Number(req.params.id);
    const versionId = String(req.params.versionId || '');
    if (!versionId) return res.status(400).json({ error: 'versionId is required' });

    const review = await prisma.review.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!review) return res.status(404).json({ error: 'Not found' });

    const version = await prisma.reviewReplyVersion.findFirst({
      where: { id: versionId, businessId: tenant.businessId, reviewId: id },
    });
    if (!version) return res.status(404).json({ error: 'Version not found' });

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.review.update({
        where: { id },
        data: { replyDraft: version.text },
      });
      await tx.reviewReplyVersion.create({
        data: {
          businessId: tenant.businessId!,
          reviewId: id,
          text: version.text,
          source: 'system',
          note: 'restore',
          diffBaseVersionId: version.id,
          createdByUserId: sessionUser?.userId || null,
        },
      });
      return next;
    });

    res.json({ success: true, review: toApiReview(updated) });
  } catch (err: any) {
    console.error('Failed to restore version', err);
    res.status(500).json({ error: 'Failed to restore version', message: err.message });
  }
});

router.patch('/:id/reply', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const id = Number(req.params.id);
    const { replyDraft, status } = req.body || {};
    const existing = await prisma.review.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const prevStatus = existing.status;
    const sessionUser = (req as any).user as { userId?: string } | undefined;
    const nextStatus = status ? String(status) : undefined;

    const updateData: any = {
      replyDraft: typeof replyDraft === 'string' ? replyDraft : undefined,
      status: nextStatus || undefined,
    };

    if (typeof nextStatus === 'string') {
      if (nextStatus === 'Needs Approval') {
        updateData.needsApprovalSince = existing.needsApprovalSince || new Date();
        // Clear approval metadata when reverting to needs-approval
        updateData.approvedAt = null;
        updateData.approvedByUserId = null;
      } else {
        updateData.needsApprovalSince = null;
      }

      // Human approval: any transition away from Needs Approval to an approved state
      const becameApproved =
        prevStatus === 'Needs Approval' &&
        nextStatus !== 'Needs Approval' &&
        nextStatus !== 'Pending Analysis' &&
        nextStatus !== 'Replied';
      if (becameApproved) {
        updateData.approvedAt = new Date();
        updateData.approvedByUserId = sessionUser?.userId || null;
      }
    }

    const draftChanged = typeof replyDraft === 'string' && String(replyDraft) !== String(existing.replyDraft || '');

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.review.update({
        where: { id },
        data: updateData,
      });

      if (draftChanged && String(replyDraft).trim()) {
        await tx.reviewReplyVersion.create({
          data: {
            businessId: tenant.businessId!,
            reviewId: id,
            text: String(replyDraft),
            source: 'human',
            note: 'edit',
            createdByUserId: sessionUser?.userId || null,
          },
        });
      }

      return next;
    });

    // Audit approval transition: when a human sets status to Auto-Approved (or any non-Needs-Approval state)
    try {
      const becameApproved =
        prevStatus === 'Needs Approval' &&
        nextStatus &&
        nextStatus !== 'Needs Approval' &&
        nextStatus !== 'Pending Analysis' &&
        nextStatus !== 'Replied';

      if (becameApproved) {
        const originalText = String(existing.replyDraft || '');
        const sanitizedText = String(updated.replyDraft || '');
        await logAuditEvent({
          businessId: tenant.businessId,
          actorUserId: sessionUser?.userId || null,
          actorRole: (tenant as any).role || null,
          action: 'APPROVE_REVIEW_REPLY',
          targetType: 'REVIEW',
          targetId: id,
          originalText,
          sanitizedText,
          violationCodes: [],
          metadata: {
            prevStatus,
            nextStatus,
          },
        });
      }
    } catch (e: any) {
      console.warn('Audit logging failed (non-fatal):', e?.message || e);
    }
    
    res.json(toApiReview(updated));
  } catch (err) {
    console.error('Failed to update reply', err);
    res.status(500).json({ error: 'Failed to update reply' });
  }
});

/**
 * POST /api/reviews/:id/analyze
 * Re-analyze a review and generate/update reply draft
 */
router.post('/:id/analyze', async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const id = Number(req.params.id);
    const review = await prisma.review.findFirst({ where: { id, businessId: tenant.businessId } });
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const { analyzeReview } = await import('../services/analysisService');
    
    const analysis = await analyzeReview({
      authorName: review.authorName,
      rating: review.rating,
      comment: review.comment,
      createTime: review.createTime.toISOString(),
      businessId: tenant.businessId,
      reviewId: review.reviewId,
    });

    // Update review with new analysis
    const hasQcFailure = (analysis.risk_flags || []).some((f: any) =>
      String(f || '').toLowerCase().includes('qc failed')
    );
    const nextStatus =
      analysis.risk_flags?.includes('HIPAA risk') || hasQcFailure || review.rating <= 3 || analysis.sentiment === 'negative'
        ? 'Needs Approval'
        : 'Auto-Approved';

    const sessionUser = (req as any).user as { userId?: string } | undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.review.update({
        where: { id },
        data: {
          sentiment: analysis.sentiment,
          urgency: analysis.urgency,
          topics: analysis.topics ? JSON.stringify(analysis.topics) : null,
          suggestedActions: analysis.suggested_actions ? JSON.stringify(analysis.suggested_actions) : null,
          riskFlags: analysis.risk_flags ? JSON.stringify(analysis.risk_flags) : null,
          replyDraft: analysis.reply_draft,
          replyLanguageCode: analysis.reply_language_code || null,
          replyVariantsJson: analysis.reply_variants ? JSON.stringify(analysis.reply_variants) : null,
          status: nextStatus,
          needsApprovalSince: nextStatus === 'Needs Approval' ? review.needsApprovalSince || new Date() : null,
          lastAnalyzedAt: new Date(),
        },
      });

      if (analysis.reply_draft && String(analysis.reply_draft).trim()) {
        await tx.reviewReplyVersion.create({
          data: {
            businessId: tenant.businessId!,
            reviewId: id,
            text: String(analysis.reply_draft),
            source: 'ai',
            note: 'analyze',
            createdByUserId: null,
          },
        });
      }

      return next;
    });

    // Deserialize for response
    const updatedWithParsedArrays = toApiReview(updated);

    res.json(updatedWithParsedArrays);
  } catch (err: any) {
    console.error('Failed to analyze review', err);
    res.status(500).json({ error: 'Failed to analyze review', message: err.message });
  }
});

/**
 * POST /api/reviews/:id/select-variant
 * Select reply variant A/B and set replyDraft accordingly.
 *
 * Body: { selected: "A" | "B" }
 */
router.post('/:id/select-variant', async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });

    const id = Number(req.params.id);
    const selectedRaw = (req.body as any)?.selected;
    const selected = String(selectedRaw || '').toUpperCase();
    if (selected !== 'A' && selected !== 'B') {
      return res.status(400).json({ error: 'selected must be "A" or "B"' });
    }

    const existing = await prisma.review.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    let variants: any = null;
    try {
      variants = (existing as any).replyVariantsJson ? JSON.parse(String((existing as any).replyVariantsJson)) : null;
    } catch {
      variants = null;
    }
    if (!variants || !variants.A || !variants.B) {
      return res.status(400).json({ error: 'No variants available for this review. Re-analyze first.' });
    }

    variants.selected = selected;
    const nextDraft = String(variants[selected]?.text || '').trim() || existing.replyDraft || '';

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.review.update({
        where: { id },
        data: {
          replyDraft: nextDraft,
          replyVariantsJson: JSON.stringify(variants),
        },
      });

      if (nextDraft.trim()) {
        await tx.reviewReplyVersion.create({
          data: {
            businessId: tenant.businessId!,
            reviewId: id,
            text: nextDraft,
            source: 'system',
            note: `select_variant_${selected}`,
            createdByUserId: null,
          },
        });
      }

      return next;
    });

    res.json(toApiReview(updated));
  } catch (err: any) {
    console.error('Failed to select variant', err);
    res.status(500).json({ error: 'Failed to select variant', message: err.message });
  }
});

/**
 * POST /api/reviews/:id/post-reply
 * Post a reply to Google Business Profile
 */
router.post('/:id/post-reply', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const id = Number(req.params.id);
    const { replyText } = req.body;

    if (!replyText) {
      return res.status(400).json({ error: 'Reply text is required' });
    }

    const review = await prisma.review.findFirst({ where: { id, businessId: tenant.businessId } });
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const settings = await getBusinessSettings(tenant.businessId);
    const bannedPhrases =
      Array.isArray((settings as any)?.bannedPhrases) ? ((settings as any).bannedPhrases as string[]) : [];
    const compliance = runComplianceGuard({
      target: 'review_reply',
      text: replyText,
      reviewComment: review.comment,
      bannedPhrases,
      allowedBusinessEmail: settings.businessEmail ?? null,
      allowedBusinessPhone: settings.businessPhone ?? null,
    });

    if (compliance.blocked) {
      return res.status(400).json({
        error: 'Reply blocked by compliance guardrails',
        violations: compliance.violations,
      });
    }

    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';

    if (!accountId || !locationId) {
      return res.status(400).json({ error: 'GOOGLE_ACCOUNT_ID and GOOGLE_LOCATION_ID must be set' });
    }

    const { postReplyToReview } = await import('../services/postReply');
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;
    const accountIdClean = accountId.replace(/^accounts\//, '');

    await postReplyToReview({
      accountId: accountIdClean,
      locationId: numericLocationId,
      reviewId: review.reviewId,
      replyText: compliance.sanitizedText,
      businessId: tenant.businessId,
      locationIdInternal: (tenant as any).locationId || undefined,
    });

    const sessionUser = (req as any).user as { userId?: string } | undefined;

    // Update review in database
    const updated = await prisma.review.update({
      where: { id },
      data: {
        repliedAt: new Date(),
        status: 'Replied',
        replyDraft: compliance.sanitizedText,
        approvedAt: new Date(),
        approvedByUserId: sessionUser?.userId || null,
      },
    });

    try {
      await logAuditEvent({
        businessId: tenant.businessId,
        actorUserId: sessionUser?.userId || null,
        actorRole: (tenant as any).role || null,
        action: 'POST_REVIEW_REPLY',
        targetType: 'REVIEW',
        targetId: id,
        originalText: replyText,
        sanitizedText: compliance.sanitizedText,
        violationCodes: compliance.violations.map((v) => v.code),
        metadata: {
          googleReviewId: review.reviewId,
          accountId: accountIdClean,
          locationId: numericLocationId,
        },
      });
    } catch (e: any) {
      console.warn('Audit logging failed (non-fatal):', e?.message || e);
    }

    res.json({ success: true, review: updated });
  } catch (err: any) {
    console.error('Failed to post reply', err);
    res.status(500).json({ error: 'Failed to post reply', message: err.message });
  }
});

/**
 * POST /api/reviews/fetch
 * Fetch new reviews from Google Business Profile and save to database
 */
router.post('/fetch', requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = (req as any).tenant as { businessId?: string; locationId?: string | null } | undefined;
    if (!tenant?.businessId) return res.status(400).json({ error: 'Missing tenant context' });
    const { syncReviewsFromGoogle } = await import('../services/reviewSync');
    const result = await syncReviewsFromGoogle({
      fetchAll: req.body.fetchAll === true,
      businessId: tenant.businessId,
      // For now, keep using the default internal location mapping unless a caller supplies it.
      locationIdInternal: tenant.locationId || undefined,
    } as any);

    res.json({
      success: true,
      count: result.fetchedFromGoogle,
      processed: result.processed,
      analyzed: result.analyzed,
      errors: result.errors,
      newOrUpdatedSaved: result.newOrUpdatedSaved,
      message: `Fetched ${result.fetchedFromGoogle} reviews, saved ${result.newOrUpdatedSaved} new/updated, analyzed ${result.analyzed}${result.errors > 0 ? `, ${result.errors} errors` : ''}`,
    });
  } catch (err: any) {
    console.error('Failed to fetch reviews', err);
    
    // Provide more detailed error information
    let errorMessage = err.message || 'Failed to fetch reviews';
    if (err.response?.data?.error?.message) {
      errorMessage = err.response.data.error.message;
    } else if (err.message?.includes('401') || err.message?.includes('unauthorized')) {
      errorMessage = 'Authentication failed. Check your Google access token or refresh token.';
    } else if (err.message?.includes('403') || err.message?.includes('permission')) {
      errorMessage = 'Permission denied. Verify API access and OAuth scopes.';
    } else if (err.message?.includes('404')) {
      errorMessage = 'Location not found. Verify GOOGLE_LOCATION_ID is correct.';
    } else if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      errorMessage = 'Rate limit exceeded. Please wait a minute and try again.';
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch reviews',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

/**
 * POST /api/reviews/auto-reply-unreplied
 * Auto-reply to all unreplied reviews from last 6 months
 */
router.post('/auto-reply-unreplied', async (req, res) => {
  try {
    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';

    if (!accountId || !locationId) {
      return res.status(400).json({ error: 'GOOGLE_ACCOUNT_ID and GOOGLE_LOCATION_ID must be set' });
    }

    // Calculate date 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Find truly unreplied reviews - check both repliedAt AND status
    // Use condition: repliedAt is null AND status is not 'Replied' AND status is not 'Needs Approval'
    const unrepliedReviews = await prisma.review.findMany({
      where: {
        createTime: { gte: sixMonthsAgo },
        repliedAt: null,
        status: {
          not: {
            in: ['Replied', 'Needs Approval'], // Exclude already replied and needs approval
          },
        },
      },
      orderBy: { createTime: 'desc' },
    });

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    const { postReplyToReview } = await import('../services/postReply');
    const { fetchGoogleReviews } = await import('../services/googleReviews');
    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;
    const accountIdClean = accountId.replace(/^accounts\//, '');

    // First, sync with Google to check which reviews already have replies
    console.log('Syncing with Google to check existing replies...');
    let googleReviews: any[] = [];
    try {
      googleReviews = await fetchGoogleReviews({ locationId });
      console.log(`Fetched ${googleReviews.length} reviews from Google`);
    } catch (error: any) {
      console.warn(`Failed to fetch Google reviews for sync: ${error.message}`);
    }

    // Create a map of reviewId -> hasReply for quick lookup
    const googleReviewMap = new Map<string, boolean>();
    for (const gr of googleReviews) {
      googleReviewMap.set(gr.reviewId, !!gr.reviewReply?.comment);
    }

    for (const review of unrepliedReviews) {
      try {
        // Check if review already has a reply on Google
        const hasReplyOnGoogle = googleReviewMap.get(review.reviewId);
        
        if (hasReplyOnGoogle) {
          console.log(`Review ${review.reviewId} already has a reply on Google, updating database...`);
          // Update database to reflect existing reply
          await prisma.review.update({
            where: { id: review.id },
            data: {
              repliedAt: new Date(), // Set to now since we don't know exact reply date
              status: 'Replied',
            },
          });
          skippedCount++;
          continue;
        }

        // Check if status is explicitly "Replied" (double-check)
        if (review.status === 'Replied') {
          console.log(`Review ${review.id} is marked as Replied, skipping...`);
          skippedCount++;
          continue;
        }

        if (!review.replyDraft) {
          // Generate reply if not exists
          const { analyzeReview } = await import('../services/analysisService');
          const analysis = await analyzeReview({
            authorName: review.authorName,
            rating: review.rating,
            comment: review.comment,
            createTime: review.createTime.toISOString(),
          });

          await prisma.review.update({
            where: { id: review.id },
            data: {
              replyDraft: analysis.reply_draft,
              sentiment: analysis.sentiment,
              urgency: analysis.urgency,
              topics: analysis.topics ? JSON.stringify(analysis.topics) : null,
              suggestedActions: analysis.suggested_actions ? JSON.stringify(analysis.suggested_actions) : null,
              riskFlags: analysis.risk_flags ? JSON.stringify(analysis.risk_flags) : null,
              lastAnalyzedAt: new Date(),
              status: analysis.risk_flags?.includes('HIPAA risk') || review.rating <= 3 || analysis.sentiment === 'negative'
                ? 'Needs Approval'
                : 'Auto-Approved',
            },
          });

          review.replyDraft = analysis.reply_draft;
          review.status = analysis.risk_flags?.includes('HIPAA risk') || review.rating <= 3 || analysis.sentiment === 'negative'
            ? 'Needs Approval'
            : 'Auto-Approved';
        }

        // Skip if needs approval
        if (review.status === 'Needs Approval') {
          console.log(`Review ${review.id} needs approval, skipping...`);
          skippedCount++;
          continue;
        }

        if (!review.replyDraft) {
          console.log(`Review ${review.id} has no reply draft, skipping...`);
          skippedCount++;
          continue;
        }

        const settings = await getBusinessSettings(review.businessId);
        const bannedPhrases = settings.bannedPhrases || [];

        const compliance = runComplianceGuard({
          target: 'review_reply',
          text: review.replyDraft,
          reviewComment: review.comment,
          bannedPhrases,
          allowedBusinessEmail: settings.businessEmail ?? null,
          allowedBusinessPhone: settings.businessPhone ?? null,
        });

        if (compliance.blocked) {
          console.log(`Review ${review.id} blocked by compliance, marking Needs Approval...`);
          let prevRisk: any[] = [];
          try {
            prevRisk = review.riskFlags ? JSON.parse(review.riskFlags) : [];
          } catch {
            prevRisk = [];
          }
          const nextRisk = Array.from(new Set([...(Array.isArray(prevRisk) ? prevRisk : []), 'HIPAA risk']));
          await prisma.review.update({
            where: { id: review.id },
            data: {
              status: 'Needs Approval',
              replyDraft: compliance.sanitizedText,
              riskFlags: JSON.stringify(nextRisk),
            },
          });
          skippedCount++;
          continue;
        }

        // Try to post reply
        try {
          await postReplyToReview({
            accountId: accountIdClean,
            locationId: numericLocationId,
            reviewId: review.reviewId,
            replyText: compliance.sanitizedText,
          });

          // Update database only after successful post
          await prisma.review.update({
            where: { id: review.id },
            data: {
              repliedAt: new Date(),
              status: 'Replied',
              replyDraft: compliance.sanitizedText,
            },
          });

          try {
            await logAuditEvent({
              businessId: review.businessId,
              actorUserId: null,
              actorRole: 'SYSTEM',
              action: 'AUTO_POST_REVIEW_REPLY',
              targetType: 'REVIEW',
              targetId: review.id,
              originalText: review.replyDraft,
              sanitizedText: compliance.sanitizedText,
              violationCodes: compliance.violations.map((v) => v.code),
              metadata: {
                googleReviewId: review.reviewId,
                accountId: accountIdClean,
                locationId: numericLocationId,
              },
            });
          } catch (e: any) {
            console.warn('Audit logging failed (non-fatal):', e?.message || e);
          }

          successCount++;
          console.log(`✅ Successfully replied to review ${review.id}`);

          // Delay between replies
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (replyError: any) {
          // Handle 409 (reply already exists) specifically
          if (replyError.message && replyError.message.includes('already exists') || replyError.message.includes('409')) {
            console.log(`Review ${review.reviewId} already has a reply on Google (409), updating database...`);
            await prisma.review.update({
              where: { id: review.id },
              data: {
                repliedAt: new Date(),
                status: 'Replied',
              },
            });
            skippedCount++;
          } else {
            throw replyError; // Re-throw other errors
          }
        }
      } catch (error: any) {
        console.error(`Failed to process review ${review.id}:`, error.message);
        failCount++;
        
        // Still add delay even on error to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    res.json({ 
      success: true, 
      successCount, 
      failCount, 
      skippedCount,
      total: unrepliedReviews.length,
      message: `Processed ${unrepliedReviews.length} reviews: ${successCount} replied, ${skippedCount} skipped (already replied or needs approval), ${failCount} failed`
    });
  } catch (err: any) {
    console.error('Failed to auto-reply', err);
    res.status(500).json({ error: 'Failed to auto-reply', message: err.message });
  }
});

/**
 * POST /api/reviews/analyze-all-unreplied
 * Analyze all unreplied reviews and generate reply drafts (without posting)
 */
router.post('/analyze-all-unreplied', async (req, res) => {
  try {
    // Calculate date 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Find ALL unreplied reviews that need analysis
    // Include reviews that:
    // 1. Haven't been replied to (repliedAt is null)
    // 2. Are not in 'Replied' status
    // We'll filter for incomplete analysis in the loop
    const unrepliedReviews = await prisma.review.findMany({
      where: {
        createTime: { gte: sixMonthsAgo },
        repliedAt: null,
        status: {
          not: 'Replied', // Exclude already replied reviews
        },
      },
      orderBy: { createTime: 'desc' },
    });

    console.log(`Found ${unrepliedReviews.length} unreplied reviews to check for analysis`);

    let analyzedCount = 0;
    let generatedCount = 0;
    let skippedCount = 0;

    const { analyzeReview } = await import('../services/analysisService');

    for (const review of unrepliedReviews) {
      try {
        // Skip if already has a complete analysis (sentiment, replyDraft, and lastAnalyzedAt)
        // But still analyze if status is 'Pending Analysis' or missing key fields
        const hasCompleteAnalysis = review.sentiment && review.replyDraft && review.lastAnalyzedAt && review.status !== 'Pending Analysis';
        
        if (hasCompleteAnalysis) {
          skippedCount++;
          continue;
        }
        
        // Log which reviews are being analyzed (especially if they were previously skipped)
        if (review.sentiment || review.replyDraft) {
          console.log(`Re-analyzing review ${review.id} (Rating: ${review.rating}⭐, incomplete analysis)`);
        } else {
          console.log(`Analyzing review ${review.id} (Rating: ${review.rating}⭐, no previous analysis)`);
        }

        // Analyze and generate reply
        const analysis = await analyzeReview({
          authorName: review.authorName,
          rating: review.rating,
          comment: review.comment,
          createTime: review.createTime.toISOString(),
        });

        // Determine status based on risk flags
        const status = analysis.risk_flags?.includes('HIPAA risk') || review.rating <= 3 || analysis.sentiment === 'negative'
          ? 'Needs Approval'
          : 'Auto-Approved';

        // Update review with analysis
        await prisma.review.update({
          where: { id: review.id },
          data: {
            sentiment: analysis.sentiment,
            urgency: analysis.urgency,
            topics: analysis.topics ? JSON.stringify(analysis.topics) : null,
            suggestedActions: analysis.suggested_actions ? JSON.stringify(analysis.suggested_actions) : null,
            riskFlags: analysis.risk_flags ? JSON.stringify(analysis.risk_flags) : null,
            replyDraft: analysis.reply_draft,
            status: status,
            lastAnalyzedAt: new Date(),
          },
        });

        analyzedCount++;
        if (analysis.reply_draft) {
          generatedCount++;
        }

        // Rate limiting - delay between analyses
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`Failed to analyze review ${review.id}:`, error.message);
        // Continue with next review
      }
    }

    res.json({
      success: true,
      analyzedCount,
      generatedCount,
      skippedCount,
      total: unrepliedReviews.length,
      message: `Analyzed ${analyzedCount} reviews, generated ${generatedCount} reply drafts, skipped ${skippedCount} (already analyzed)`
    });
  } catch (err: any) {
    console.error('Failed to analyze unreplied reviews', err);
    res.status(500).json({ error: 'Failed to analyze reviews', message: err.message });
  }
});

export default router;

