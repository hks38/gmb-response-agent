# How to Find Your Location ID and Account ID (Without API)

Since we're hitting API rate limits, here are alternative ways to find your Location ID and Account ID:

## Method 1: From Google Business Profile URL

1. Go to [Google Business Profile](https://business.google.com/)
2. Select your business location
3. Look at the URL - sometimes the location ID is in the URL parameters
4. Check the browser's developer tools (F12) → Network tab → Look for API calls that might contain the location ID

## Method 2: From Google Business Profile Manager

1. Go to [Google Business Profile Manager](https://business.google.com/locations)
2. Select your location
3. The Location ID might be visible in:
   - The URL parameters
   - Settings → Advanced settings
   - In the page source (View Page Source → Search for "location" or "account")

## Method 3: From Google Search/Google Maps

1. Find your business on Google Maps
2. Right-click on your business → Copy link
3. The location ID might be in the URL
4. Or check the "Share" link - sometimes it contains location identifiers

## Method 4: Check Existing Tools/Integrations

If you've used other tools that connect to Google Business Profile:
- Check their settings/configuration
- They might display the Location ID or Account ID

## Method 5: Use Google Business Profile API Documentation

The Location ID format is typically:
- Full format: `accounts/{accountId}/locations/{locationId}`
- Short format: `locations/{locationId}`

Once you find either the account ID or location ID, you can usually figure out the other one from the API response structure.

## Method 6: Contact Google Support

If you can't find it anywhere, Google Business Profile support might be able to provide your Location ID and Account ID.

## Once You Have the IDs

Add them to your `.env` file:

```env
GOOGLE_LOCATION_ID="locations/1234567890"
GOOGLE_ACCOUNT_ID="accounts/123456"
```

**Note:** The Location ID might be just the number part, or the full path format. The code should handle both, but try the full format first: `accounts/{accountId}/locations/{locationId}`

## Alternative: Wait for Rate Limit to Reset

You can also just wait 5-10 minutes for the API rate limit to reset, then run:
```bash
npm run get-location-id
```

The script will work once the quota resets.

