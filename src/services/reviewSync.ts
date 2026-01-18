import { prisma } from '../db/client';
import { fetchGoogleReviews } from './googleReviews';
import { analyzeReview } from './analysisService';
import { discoverFirstLocation } from './discoverLocation';
import { getDefaultBusinessId, getDefaultLocationId } from './tenantDefaults';

export interface ReviewSyncResult {
  fetchedFromGoogle: number;
  processed: number;
  analyzed: number;
  errors: number;
  newOrUpdatedSaved: number;
}

const normalizeRating = (rating: unknown): number => {
  if (typeof rating === 'number') return rating;
  if (typeof rating === 'string') {
    const map: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    return map[rating] || Number(rating) || 0;
  }
  return 0;
};

const needsApproval = (analysis: any, rating: number): boolean => {
  const hasHipaaRisk = (analysis.risk_flags || []).some((flag: string) =>
    flag.toLowerCase().includes('hipaa')
  );
  const hasQcFailure = (analysis.risk_flags || []).some((flag: string) =>
    String(flag || '').toLowerCase().includes('qc failed')
  );
  const isNegative = analysis.sentiment === 'negative';
  const lowRating = rating <= 3;
  return hasHipaaRisk || hasQcFailure || isNegative || lowRating;
};

export const syncReviewsFromGoogle = async (opts?: {
  fetchAll?: boolean;
  businessId?: string;
  locationIdInternal?: string;
  googleLocationId?: string;
  googleAccountId?: string;
}): Promise<ReviewSyncResult> => {
  const businessId = (opts as any)?.businessId || (await getDefaultBusinessId());
  const locationIdInternal = (opts as any)?.locationIdInternal || (await getDefaultLocationId());

  let locationId = opts?.googleLocationId || process.env.GOOGLE_LOCATION_ID || '';

  if (!locationId) {
    const discovered = await discoverFirstLocation();
    if (!discovered) throw new Error('GOOGLE_LOCATION_ID not set and could not auto-discover location');
    locationId = discovered.locationId;
  }

  const fetchAll = !!opts?.fetchAll;
  let since: string | undefined;
  if (!fetchAll) {
    const lastUpdate = await prisma.review.aggregate({ _max: { updateTime: true } });
    since = lastUpdate._max.updateTime?.toISOString();
  }

  const googleReviews = await fetchGoogleReviews({
    locationId,
    sinceUpdateTime: fetchAll ? undefined : since,
    accountId: opts?.googleAccountId,
    businessId,
    locationIdInternal,
  });

  let processed = 0;
  let analyzed = 0;
  let errors = 0;
  let newOrUpdatedSaved = 0;

  for (const review of googleReviews) {
    try {
      const rating = normalizeRating((review as any).starRating ?? (review as any).rating);
      const existing = await prisma.review.findUnique({
        where: { locationId_reviewId: { locationId: locationIdInternal, reviewId: review.reviewId } },
      });

      const isUpdated =
        !existing ||
        new Date(review.updateTime).getTime() >
          (existing.updateTime ? new Date(existing.updateTime).getTime() : 0);

      // Check if review already has a reply on Google
      const reviewData = review as any;
      const hasReplyOnGoogle = !!(
        reviewData.reviewReply?.comment ||
        reviewData.reply?.comment ||
        (reviewData.reviewReply && Object.keys(reviewData.reviewReply).length > 0) ||
        (reviewData.reply && Object.keys(reviewData.reply).length > 0)
      );

      let replyTime: Date | null = null;
      if (hasReplyOnGoogle) {
        replyTime = reviewData.reviewReply?.updateTime
          ? new Date(reviewData.reviewReply.updateTime)
          : reviewData.reviewReply?.createTime
          ? new Date(reviewData.reviewReply.createTime)
          : reviewData.reply?.updateTime
          ? new Date(reviewData.reply.updateTime)
          : reviewData.reply?.createTime
          ? new Date(reviewData.reply.createTime)
          : new Date();
      }

      // If unchanged, only sync reply status if needed
      if (!isUpdated && existing) {
        const needsReplySync = hasReplyOnGoogle && (!existing.repliedAt || existing.status !== 'Replied');
        if (needsReplySync) {
          await prisma.review.update({
            where: { locationId_reviewId: { locationId: locationIdInternal, reviewId: review.reviewId } },
            data: { status: 'Replied', repliedAt: replyTime },
          });
          processed += 1;
          continue;
        }
        processed += 1;
        continue;
      }

      let analysis: any = null;
      let status = 'Needs Approval';
      
      // Skip analysis if review already has a reply on Google (no need to generate draft)
      const shouldSkipAnalysis = hasReplyOnGoogle;
      
      const needsAnalysis =
        !shouldSkipAnalysis && 
        (isUpdated || !existing || !existing.sentiment || !existing.replyDraft || existing.status === 'Pending Analysis');

      if (needsAnalysis) {
        try {
          analysis = await analyzeReview({
            authorName: review.reviewer?.displayName || 'Guest',
            rating,
            comment: review.comment,
            createTime: review.createTime,
            businessId,
            reviewId: review.reviewId,
          });
          status = needsApproval(analysis, rating) ? 'Needs Approval' : 'Auto-Approved';
          analyzed += 1;
        } catch (analysisError: any) {
          errors += 1;
          if (existing && existing.sentiment) {
            analysis = {
              sentiment: existing.sentiment,
              urgency: existing.urgency,
              topics: existing.topics ? JSON.parse(existing.topics) : [],
              suggested_actions: existing.suggestedActions ? JSON.parse(existing.suggestedActions) : [],
              risk_flags: existing.riskFlags ? JSON.parse(existing.riskFlags) : [],
              reply_draft: existing.replyDraft || '',
            };
            status = existing.status;
          }
        }
      } else if (existing) {
        analysis = {
          sentiment: existing.sentiment,
          urgency: existing.urgency,
          topics: existing.topics ? JSON.parse(existing.topics) : [],
          suggested_actions: existing.suggestedActions ? JSON.parse(existing.suggestedActions) : [],
          risk_flags: existing.riskFlags ? JSON.parse(existing.riskFlags) : [],
          reply_draft: existing.replyDraft || '',
        };
        status = existing.status || 'Pending Analysis';
      }

      await prisma.review.upsert({
        where: { locationId_reviewId: { locationId: locationIdInternal, reviewId: review.reviewId } },
        create: {
          businessId,
          locationId: locationIdInternal,
          reviewId: review.reviewId,
          authorName: review.reviewer?.displayName || 'Guest',
          rating,
          comment: review.comment,
          createTime: new Date(review.createTime),
          updateTime: new Date(review.updateTime),
          sentiment: analysis?.sentiment || null,
          urgency: analysis?.urgency || null,
          topics: analysis ? JSON.stringify(analysis.topics || []) : null,
          suggestedActions: analysis ? JSON.stringify(analysis.suggested_actions || []) : null,
          riskFlags: analysis ? JSON.stringify(analysis.risk_flags || []) : null,
          replyDraft: analysis?.reply_draft || null,
          replyLanguageCode: analysis?.reply_language_code || null,
          replyVariantsJson: analysis?.reply_variants ? JSON.stringify(analysis.reply_variants) : null,
          status: hasReplyOnGoogle ? 'Replied' : analysis ? status : 'Pending Analysis',
          repliedAt: replyTime,
          lastAnalyzedAt: analysis ? new Date() : null,
        },
        update: {
          authorName: review.reviewer?.displayName || 'Guest',
          rating,
          comment: review.comment,
          updateTime: new Date(review.updateTime),
          sentiment: analysis?.sentiment || existing?.sentiment || null,
          urgency: analysis?.urgency || existing?.urgency || null,
          topics: analysis ? JSON.stringify(analysis.topics || []) : existing?.topics || null,
          suggestedActions: analysis ? JSON.stringify(analysis.suggested_actions || []) : existing?.suggestedActions || null,
          riskFlags: analysis ? JSON.stringify(analysis.risk_flags || []) : existing?.riskFlags || null,
          replyDraft: analysis?.reply_draft || existing?.replyDraft || null,
          replyLanguageCode: analysis?.reply_language_code || existing?.replyLanguageCode || null,
          replyVariantsJson: analysis?.reply_variants
            ? JSON.stringify(analysis.reply_variants)
            : existing?.replyVariantsJson || null,
          status: hasReplyOnGoogle ? 'Replied' : analysis ? status : existing?.status || 'Pending Analysis',
          repliedAt: hasReplyOnGoogle ? replyTime : existing?.repliedAt || null,
          lastAnalyzedAt: analysis ? new Date() : existing?.lastAnalyzedAt || null,
        },
      });

      if (!existing || isUpdated) newOrUpdatedSaved += 1;
      processed += 1;
    } catch {
      errors += 1;
    }
  }

  return {
    fetchedFromGoogle: googleReviews.length,
    processed,
    analyzed,
    errors,
    newOrUpdatedSaved,
  };
};


