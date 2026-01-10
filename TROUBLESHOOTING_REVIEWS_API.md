# Troubleshooting Reviews API 404 Error

If you're getting a 404 error when fetching reviews, it's likely because:

## The Issue

With Google's API split, reviews are still accessed through the **old unified API endpoint** (`mybusiness.googleapis.com/v4`), not the new split APIs.

## Solution: Enable the Old Unified API

You need to enable **both**:

1. ✅ **My Business Account Management API** (already enabled - for accounts/locations)
2. ✅ **My Business Business Information API** (already enabled - for business data)
3. ❌ **Google Business Profile API** or **My Business API** (old unified API - **REQUIRED for reviews**)

### Steps to Enable:

1. Go to [Google Cloud Console APIs Library](https://console.cloud.google.com/apis/library)
2. Search for **"Google Business Profile API"** or **"My Business API"**
3. **Enable it** (even though Google split it, reviews still use the old endpoint)
4. Wait 5-10 minutes for it to activate
5. Try `npm run fetch-reviews` again

## Alternative: Check API Documentation

The reviews endpoint is:
- Base: `https://mybusiness.googleapis.com/v4`
- Path: `/{locationId}/reviews`
- Where locationId format: `locations/{id}` or full path `accounts/{accountId}/locations/{locationId}`

## Verify APIs Enabled

Go to [Enabled APIs](https://console.cloud.google.com/apis/dashboard) and verify you have:
- ✅ My Business Account Management API
- ✅ My Business Business Information API  
- ✅ **Google Business Profile API** (or My Business API) - **This one is critical for reviews!**

