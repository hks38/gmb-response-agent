# Which Google Business Profile APIs to Enable

Google has split the Business Profile API into multiple services. You need to enable:

## Required APIs:

1. **My Business Account Management API**
   - For managing accounts and listing locations
   - This is what we need for the `/v4/accounts` endpoint

2. **My Business Business Information API** (may also be needed)
   - For accessing business information and reviews

## How to Enable:

1. Go to [Google Cloud Console APIs Library](https://console.cloud.google.com/apis/library)
2. Make sure your project is selected (the one with OAuth credentials)
3. Search for and enable:
   - **"My Business Account Management API"**
   - **"My Business Business Information API"**
4. Wait 5-10 minutes for them to activate
5. Run `npm run get-location-id` again

## Deprecated APIs:

- ❌ "Google Business Profile API" (old name, may be deprecated)
- ❌ "My Business API" (old name, may be deprecated)

## Other APIs (NOT needed for this):

- ❌ "Business Profile Performance API" (analytics only)
- ❌ "My Business Verification API" (verification only)

## After Enabling:

Once you've enabled the correct APIs, the `/v4/accounts` endpoint should work and you'll be able to get your location ID.

