# How to Get Your Location ID

## The Issue

The `/v4/accounts` endpoint is returning 404. This typically means:

1. **Google Business Profile API is not enabled** in your Google Cloud project
2. **Wrong API version** - Google has been migrating APIs
3. **Endpoint structure has changed**

## Solution: Enable the Correct API

### Step 1: Enable Google Business Profile API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (the one with your OAuth credentials)
3. Go to **APIs & Services** → **Library**
4. Search for **"Google Business Profile API"** (it might also be listed as "My Business API")
   - ⚠️ **Important:** Make sure you enable the correct one:
     - ✅ **"Google Business Profile API"** or **"My Business API"** - This is what you need
     - ❌ **"Business Profile Performance API"** - This is for analytics only, NOT for reviews/locations
     - ❌ **"My Business Business Information API"** - This is different, won't work for reviews
5. Click on it and click **"Enable"**
6. Wait 5-10 minutes for the API to be fully enabled

### Step 2: Verify API is Enabled

1. Go to **APIs & Services** → **Enabled APIs**
2. Look for "Google Business Profile API" (or "My Business API")
3. It should show as **Enabled**

### Step 3: Try the Script Again

Once the API is enabled, run:

```bash
npm run get-location-id
```

## Alternative: Manual Method Using OAuth Playground

If the API endpoint still doesn't work, you can get your Location ID manually:

### Option A: Using OAuth Playground

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Configure it to use your credentials (gear icon → "Use your own OAuth credentials")
3. Enter your Client ID and Client Secret
4. In the left panel, find **"Google Business Profile API v4"**
5. Expand it and select: `https://www.googleapis.com/auth/business.manage`
6. Click **"Authorize APIs"**
7. Click **"Exchange authorization code for tokens"**
8. Copy the **Access token**

### Option B: Use the Access Token in curl

Once you have a valid access token, run:

```bash
# Get accounts
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://mybusiness.googleapis.com/v4/accounts"

# If that works, use the account name from the response to get locations
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://mybusiness.googleapis.com/v4/accounts/ACCOUNT_NAME/locations"
```

Replace:
- `YOUR_ACCESS_TOKEN` with your actual access token
- `ACCOUNT_NAME` with the account name from the first response (format: `accounts/123456789`)

### Option C: Check Google Business Profile Manager

Sometimes the Location ID can be found in your Google Business Profile:

1. Go to [Google Business Profile](https://business.google.com/)
2. Select your business location
3. Check the URL - sometimes the location ID is in the URL parameters
4. Or go to Settings → Advanced settings (if available)

## What to Look For in the Response

When you successfully call the API, you should see something like:

```json
{
  "locations": [
    {
      "name": "accounts/123456789/locations/987654321",
      "title": "Your Business Name",
      "storefrontAddress": {
        "addressLines": ["123 Main St"],
        "locality": "City",
        "administrativeArea": "State",
        "postalCode": "12345"
      }
    }
  ]
}
```

**The Location ID is:** `locations/987654321` (or just use the full `name` field: `accounts/123456789/locations/987654321`)

Add to your `.env`:
```env
GOOGLE_LOCATION_ID="locations/987654321"
# or
GOOGLE_LOCATION_ID="accounts/123456789/locations/987654321"
```

## Still Getting 404?

If you're still getting 404 after enabling the API:

1. **Wait 5-10 minutes** - API enablement can take time to propagate
2. **Check the API name** - Make sure it's "Google Business Profile API" (not "My Business Account Management API")
3. **Verify OAuth scope** - Make sure your refresh token has `business.manage` scope
4. **Try revoking and re-authorizing** - Sometimes re-running the OAuth flow helps
5. **Check API quotas** - Make sure your project isn't over quota limits

