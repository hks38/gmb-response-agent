import { Router } from 'express';
import { prisma } from '../db/client';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { status, sentiment, rating } = req.query;

    const where: any = {};
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
      // Fix any inconsistencies: if repliedAt exists but status is not 'Replied', fix it
      const fixedStatus = review.repliedAt ? 'Replied' : review.status;
      
      return {
        ...review,
        status: fixedStatus, // Ensure consistency
        topics: review.topics ? JSON.parse(review.topics) : [],
        suggestedActions: review.suggestedActions ? JSON.parse(review.suggestedActions) : [],
        riskFlags: review.riskFlags ? JSON.parse(review.riskFlags) : [],
      };
    });

    res.json(reviewsWithParsedArrays);
  } catch (err) {
    console.error('Failed to list reviews', err);
    res.status(500).json({ error: 'Failed to list reviews' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) return res.status(404).json({ error: 'Not found' });
    
    // Deserialize JSON strings back to arrays for frontend
    const reviewWithParsedArrays = {
      ...review,
      topics: review.topics ? JSON.parse(review.topics) : [],
      suggestedActions: review.suggestedActions ? JSON.parse(review.suggestedActions) : [],
      riskFlags: review.riskFlags ? JSON.parse(review.riskFlags) : [],
    };
    
    res.json(reviewWithParsedArrays);
  } catch (err) {
    console.error('Failed to fetch review', err);
    res.status(500).json({ error: 'Failed to fetch review' });
  }
});

router.patch('/:id/reply', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { replyDraft, status } = req.body || {};
    const updated = await prisma.review.update({
      where: { id },
      data: {
        replyDraft,
        status: status || undefined,
      },
    });
    
    // Deserialize JSON strings back to arrays for frontend
    const updatedWithParsedArrays = {
      ...updated,
      topics: updated.topics ? JSON.parse(updated.topics) : [],
      suggestedActions: updated.suggestedActions ? JSON.parse(updated.suggestedActions) : [],
      riskFlags: updated.riskFlags ? JSON.parse(updated.riskFlags) : [],
    };
    
    res.json(updatedWithParsedArrays);
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
    const id = Number(req.params.id);
    const review = await prisma.review.findUnique({ where: { id } });
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const { analyzeReview } = await import('../services/analysisService');
    
    const analysis = await analyzeReview({
      authorName: review.authorName,
      rating: review.rating,
      comment: review.comment,
      createTime: review.createTime.toISOString(),
    });

    // Update review with new analysis
    const updated = await prisma.review.update({
      where: { id },
      data: {
        sentiment: analysis.sentiment,
        urgency: analysis.urgency,
        topics: analysis.topics ? JSON.stringify(analysis.topics) : null,
        suggestedActions: analysis.suggested_actions ? JSON.stringify(analysis.suggested_actions) : null,
        riskFlags: analysis.risk_flags ? JSON.stringify(analysis.risk_flags) : null,
        replyDraft: analysis.reply_draft,
        status: analysis.risk_flags?.includes('HIPAA risk') || review.rating <= 3 || analysis.sentiment === 'negative'
          ? 'Needs Approval'
          : 'Auto-Approved',
        lastAnalyzedAt: new Date(),
      },
    });

    // Deserialize for response
    const updatedWithParsedArrays = {
      ...updated,
      topics: updated.topics ? JSON.parse(updated.topics) : [],
      suggestedActions: updated.suggestedActions ? JSON.parse(updated.suggestedActions) : [],
      riskFlags: updated.riskFlags ? JSON.parse(updated.riskFlags) : [],
    };

    res.json(updatedWithParsedArrays);
  } catch (err: any) {
    console.error('Failed to analyze review', err);
    res.status(500).json({ error: 'Failed to analyze review', message: err.message });
  }
});

/**
 * POST /api/reviews/:id/post-reply
 * Post a reply to Google Business Profile
 */
router.post('/:id/post-reply', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { replyText } = req.body;

    if (!replyText) {
      return res.status(400).json({ error: 'Reply text is required' });
    }

    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
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
      replyText,
    });

    // Update review in database
    const updated = await prisma.review.update({
      where: { id },
      data: {
        repliedAt: new Date(),
        status: 'Replied',
        replyDraft: replyText,
      },
    });

    res.json({ success: true, review: updated });
  } catch (err: any) {
    console.error('Failed to post reply', err);
    res.status(500).json({ error: 'Failed to post reply', message: err.message });
  }
});

/**
 * POST /api/reviews/fetch
 * Fetch new reviews from Google Business Profile
 */
router.post('/fetch', async (req, res) => {
  try {
    const { fetchGoogleReviews } = await import('../services/googleReviews');
    const locationId = process.env.GOOGLE_LOCATION_ID || '';
    
    if (!locationId) {
      return res.status(400).json({ error: 'GOOGLE_LOCATION_ID must be set' });
    }

    const reviews = await fetchGoogleReviews({ locationId });
    res.json({ success: true, count: reviews.length, reviews });
  } catch (err: any) {
    console.error('Failed to fetch reviews', err);
    res.status(500).json({ error: 'Failed to fetch reviews', message: err.message });
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

        // Try to post reply
        try {
          await postReplyToReview({
            accountId: accountIdClean,
            locationId: numericLocationId,
            reviewId: review.reviewId,
            replyText: review.replyDraft,
          });

          // Update database only after successful post
          await prisma.review.update({
            where: { id: review.id },
            data: {
              repliedAt: new Date(),
              status: 'Replied',
            },
          });

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

