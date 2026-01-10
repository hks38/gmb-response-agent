# Bug Fixes: Unreplied Count & Duplicate Replies

## Issues Fixed

### 1. Incorrect Unreplied Count
**Problem**: Dashboard was showing 51 unreplied reviews when the actual count was incorrect.

**Root Cause**: 
- Unreplied count was only checking `repliedAt === null`
- Reviews with `status === 'Replied'` but `repliedAt === null` were incorrectly counted
- Reviews with `repliedAt` set but status not updated were also miscounted

**Fix**:
- Updated `loadStats()` in `public/index.html` to check both `repliedAt` AND `status === 'Replied'`
- Updated review list endpoint to sync status: if `repliedAt` exists, ensure status is 'Replied'
- Fixed unreplied filter to exclude reviews with `status === 'Replied'` or `status === 'Needs Approval'`

### 2. Duplicate Replies Being Posted
**Problem**: Auto-reply was posting replies to reviews that already had replies on Google.

**Root Cause**:
- Auto-reply logic only checked database `repliedAt` field
- When reviews were manually replied on Google (outside the system), database wasn't updated
- No check against Google API to verify if reply already exists before posting

**Fixes Applied**:

1. **Updated GoogleReview Type** (`src/types.ts`):
   - Added `reviewReply` field to include reply information from Google API

2. **Enhanced fetchReviews Script** (`scripts/fetchReviews.ts`):
   - Now checks `reviewReply.comment` from Google API
   - Sets `repliedAt` and `status: 'Replied'` when Google indicates a reply exists
   - Syncs reply status on both create and update operations

3. **Improved Auto-Reply Logic** (`src/routes/reviews.ts`):
   - Before processing, syncs with Google API to get current reply status
   - Creates a map of `reviewId -> hasReply` for quick lookup
   - Checks Google reply status before attempting to post
   - Handles 409 (Conflict) error when reply already exists
   - Updates database when duplicate is detected instead of failing
   - Added `skippedCount` to track reviews that were already replied

4. **Better Error Handling**:
   - Specifically catches 409 (reply already exists) errors
   - Updates database instead of treating as failure
   - Provides detailed logging for debugging

## How to Use

### To Sync Existing Reviews:
1. Run fetch reviews to sync reply status from Google:
   ```bash
   npm run fetch-reviews
   ```

### To Fix Unreplied Count:
1. The dashboard will now show correct count automatically
2. If still incorrect, refresh the page or run fetch-reviews again

### To Auto-Reply Safely:
1. The auto-reply function now:
   - Checks Google API first
   - Skips reviews that already have replies
   - Updates database when duplicates are found
   - Only posts to truly unreplied reviews

## Testing

After these fixes:
1. Run `npm run fetch-reviews` to sync all reviews from Google
2. Check dashboard - unreplied count should be accurate
3. Try auto-reply - should skip reviews that already have replies
4. Verify no duplicate replies are posted

## Files Modified

- `src/types.ts` - Added reviewReply to GoogleReview type
- `scripts/fetchReviews.ts` - Added reply status syncing
- `src/routes/reviews.ts` - Fixed auto-reply logic and unreplied filter
- `public/index.html` - Fixed unreplied count calculation

