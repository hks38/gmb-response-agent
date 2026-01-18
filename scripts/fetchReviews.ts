import dotenv from 'dotenv';
import { prisma } from '../src/db/client';
import { fetchGoogleReviews } from '../src/services/googleReviews';
import { analyzeReview } from '../src/services/analysisService';
import { ReviewAnalysis } from '../src/types';
import { discoverFirstLocation } from '../src/services/discoverLocation';
import { getDefaultBusinessId, getDefaultLocationId } from '../src/services/tenantDefaults';

dotenv.config();

let GOOGLE_LOCATION_ID = process.env.GOOGLE_LOCATION_ID;

const normalizeRating = (rating: unknown): number => {
  if (typeof rating === 'number') return rating;
  if (typeof rating === 'string') {
    const map: Record<string, number> = {
      ONE: 1,
      TWO: 2,
      THREE: 3,
      FOUR: 4,
      FIVE: 5,
    };
    return map[rating] || Number(rating) || 0;
  }
  return 0;
};

const needsApproval = (analysis: ReviewAnalysis, rating: number): boolean => {
  const hasHipaaRisk = (analysis.risk_flags || []).some((flag) =>
    flag.toLowerCase().includes('hipaa')
  );
  const isNegative = analysis.sentiment === 'negative';
  const lowRating = rating <= 3;
  return hasHipaaRisk || isNegative || lowRating;
};

const main = async () => {
  const businessId = await getDefaultBusinessId();
  const locationIdInternal = await getDefaultLocationId();

  // Auto-discover location ID if not provided, or get account ID if location ID is partial
  let accountId: string | undefined;
  if (!GOOGLE_LOCATION_ID) {
    console.log('Location ID not found in .env, attempting to discover...');
    try {
      const discovered = await discoverFirstLocation();
      if (discovered) {
        GOOGLE_LOCATION_ID = discovered.locationId;
        accountId = discovered.accountId;
        console.log(`✓ Discovered location: ${discovered.locationName || 'Unknown'}`);
        console.log(`  Location ID: ${discovered.locationId}`);
        if (discovered.address) {
          console.log(`  Address: ${discovered.address}`);
        }
        console.log(`\n💡 Tip: Add this to your .env file to skip auto-discovery:`);
        console.log(`   GOOGLE_LOCATION_ID="${discovered.locationId}"`);
        console.log();
      } else {
        throw new Error('No locations found. Please set GOOGLE_LOCATION_ID in .env');
      }
    } catch (error: any) {
      console.error('\n✗ Failed to auto-discover location ID:', error.message);
      console.error('\nPlease set GOOGLE_LOCATION_ID in your .env file.');
      console.error('Run: npm run get-location-id (after rate limits reset)');
      throw error;
    }
  }

  console.log(`Using Location ID: ${GOOGLE_LOCATION_ID}`);

  // Check if we should fetch all reviews or just new ones
  const fetchAll = process.argv.includes('--all') || process.argv.includes('-a');
  
  let since: string | undefined;
  if (!fetchAll) {
    const lastUpdate = await prisma.review.aggregate({
      _max: { updateTime: true },
    });
    since = lastUpdate._max.updateTime?.toISOString();
  }

  console.log(`Fetching reviews${since ? ` since ${since}` : ' (all reviews)'}...`);

  const googleReviews = await fetchGoogleReviews({
    locationId: GOOGLE_LOCATION_ID,
    sinceUpdateTime: fetchAll ? undefined : since,
  });

  console.log(`Fetched ${googleReviews.length} reviews from Google.`);

  let processed = 0;
  let analyzed = 0;
  let errors = 0;

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

      // Check if review already has a reply on Google (always check, even if review hasn't updated)
      // The API response structure may vary, so check multiple possible fields
      const reviewData = review as any;
      const hasReplyOnGoogle = !!(
        reviewData.reviewReply?.comment ||
        reviewData.reply?.comment ||
        (reviewData.reviewReply && Object.keys(reviewData.reviewReply).length > 0) ||
        (reviewData.reply && Object.keys(reviewData.reply).length > 0)
      );
      
      // Try to extract reply time from various possible locations
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
          : new Date(); // Fallback to current time if we can't determine
      }
      
      // Debug logging to see what we're getting from Google
      if (hasReplyOnGoogle) {
        console.log(`  → Review ${review.reviewId} has reply on Google`);
        if (reviewData.reviewReply) {
          console.log(`     Reply data:`, JSON.stringify(reviewData.reviewReply, null, 2));
        } else if (reviewData.reply) {
          console.log(`     Reply data:`, JSON.stringify(reviewData.reply, null, 2));
        }
      }

      // If review hasn't been updated BUT we need to sync reply status, do that
      if (!isUpdated && existing) {
        // Check if reply status needs syncing
        const needsReplySync = hasReplyOnGoogle && (!existing.repliedAt || existing.status !== 'Replied');
        
        if (needsReplySync) {
          console.log(`  → Syncing reply status for review ${review.reviewId} (already has reply on Google)`);
          await prisma.review.update({
            where: { locationId_reviewId: { locationId: locationIdInternal, reviewId: review.reviewId } },
            data: {
              status: 'Replied',
              repliedAt: replyTime,
            },
          });
          processed += 1;
          continue;
        } else if (!hasReplyOnGoogle && existing.repliedAt) {
          // Review was marked as replied in DB but Google doesn't have reply - this shouldn't happen but handle it
          // Don't update, keep DB state
          processed += 1;
          continue;
        } else {
          // No changes needed
          processed += 1;
          continue;
        }
      }

      // Try to analyze, but save review even if analysis fails
      // Analyze if: review is new, updated, OR has never been analyzed (no sentiment/replyDraft)
      let analysis: ReviewAnalysis | null = null;
      let status = 'Needs Approval'; // Default status

      const needsAnalysis = isUpdated || !existing || !existing.sentiment || !existing.replyDraft || existing.status === 'Pending Analysis';
      
      if (needsAnalysis) {
        try {
          analysis = await analyzeReview({
            authorName: review.reviewer?.displayName || 'Guest',
            rating,
            comment: review.comment,
            createTime: review.createTime,
          });

          status = needsApproval(analysis, rating) ? 'Needs Approval' : 'Auto-Approved';
          analyzed += 1;
          
          if (!isUpdated && existing) {
            console.log(`  → Re-analyzing review ${review.reviewId} (was missing analysis)`);
          }
        } catch (analysisError: any) {
          console.warn(`⚠️  Analysis failed for review ${review.reviewId}: ${analysisError.message}`);
          console.warn(`   Saving review without analysis. You can analyze later.`);
          errors += 1;
          // Continue without analysis - save the review anyway
          // Keep existing analysis if available
          if (existing && existing.sentiment) {
            analysis = {
              sentiment: existing.sentiment as any,
              urgency: existing.urgency as any,
              topics: existing.topics ? JSON.parse(existing.topics) : [],
              suggested_actions: existing.suggestedActions ? JSON.parse(existing.suggestedActions) : [],
              risk_flags: existing.riskFlags ? JSON.parse(existing.riskFlags) : [],
              reply_draft: existing.replyDraft || '',
            };
            status = existing.status || 'Pending Analysis';
          }
        }
      } else {
        // Use existing analysis/status for unchanged reviews that already have analysis
        status = existing?.status || 'Pending Analysis';
      }

      // Save review with or without analysis
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
          status: hasReplyOnGoogle ? 'Replied' : (analysis ? status : 'Pending Analysis'),
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
          // Sync reply status from Google - if Google has a reply, mark as Replied
          status: hasReplyOnGoogle ? 'Replied' : (analysis ? status : existing?.status || 'Pending Analysis'),
          repliedAt: hasReplyOnGoogle ? replyTime : existing?.repliedAt || null,
          lastAnalyzedAt: analysis ? new Date() : existing?.lastAnalyzedAt || null,
        },
      });

      processed += 1;
      const statusInfo = hasReplyOnGoogle ? ' - has reply on Google (synced)' : (analysis ? ' - analyzed' : ' - pending analysis');
      console.log(`✓ Saved review ${review.reviewId} (${processed}/${googleReviews.length})${statusInfo}`);
    } catch (error: any) {
      errors += 1;
      console.error(`✗ Failed to process review ${review.reviewId}: ${error.message}`);
      console.error(`   Continuing with next review...`);
      // Continue processing other reviews
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Processed: ${processed}/${googleReviews.length} reviews`);
  console.log(`   Analyzed: ${analyzed} reviews`);
  if (errors > 0) {
    console.log(`   Errors: ${errors} reviews (saved without analysis)`);
    console.log(`   💡 Run again to retry analysis for failed reviews`);
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

