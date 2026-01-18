# Google Ads API Setup Guide

This guide will help you set up the Google Ads API to get real keyword cost data instead of mock data.

## Prerequisites

1. A Google Ads account
2. Access to Google Cloud Console
3. A Google Ads Manager account (MCC) or a regular Google Ads account

## Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Ads API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Ads API"
   - Click "Enable"

4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Desktop app" as the application type
   - Name it (e.g., "Google Ads API Client")
   - Click "Create"
   - **Save the Client ID and Client Secret** - you'll need these

## Step 2: Get Developer Token

1. Sign in to your [Google Ads account](q)
2. Go to **Tools & Settings** > **API Center**
3. If you don't have a developer token:
   - Click "Apply for access"
   - Fill out the application form
   - Wait for approval (usually 24-48 hours)
4. Once approved, copy your **Developer Token**

## Step 3: Get Refresh Token

You need to generate a refresh token using OAuth 2.0. Here's a quick way:

1. Use the OAuth 2.0 Playground or a script to get the refresh token
2. You'll need to:
   - Authorize with your Google account
   - Grant access to Google Ads API
   - Exchange the authorization code for a refresh token

### Quick Method: Using OAuth 2.0 Playground

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret
5. In the left panel, find "Google Ads API" and select:
   - `https://www.googleapis.com/auth/adwords`
6. Click "Authorize APIs"
7. Sign in and grant permissions
8. Click "Exchange authorization code for tokens"
9. Copy the **Refresh Token**

## Step 4: Get Customer ID

1. In your Google Ads account, go to **Tools & Settings** > **Account Settings**
2. Your Customer ID is displayed at the top (format: XXX-XXX-XXXX)
3. Remove the dashes when using it (e.g., `1234567890`)

## Step 5: Configure Environment Variables

Add these to your `.env` file in the `gmbResponseAgent` directory:

```env
# Google Ads API Configuration
GOOGLE_ADS_CUSTOMER_ID=1234567890
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token_here
GOOGLE_ADS_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=your_client_secret_here
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token_here
```

## Step 6: Test the Configuration

1. Restart your backend server
2. Check the console logs - you should see "Google Ads API configured successfully"
3. Try fetching keyword costs - you should see real data instead of mock data

## Troubleshooting

### "Invalid credentials" error
- Double-check all environment variables are set correctly
- Ensure there are no extra spaces or quotes
- Verify the Customer ID doesn't have dashes

### "Developer token not approved" error
- Make sure your developer token application was approved
- Check that you're using the correct developer token

### "Insufficient permissions" error
- Ensure the OAuth scope includes `https://www.googleapis.com/auth/adwords`
- Verify your Google account has access to the Google Ads account

### "Rate limit exceeded" error
- The API has rate limits - the service will automatically fall back to mock data
- Wait a few minutes and try again

## Notes

- The service will automatically fall back to mock data if:
  - API credentials are not configured
  - API calls fail
  - Rate limits are exceeded
- Mock data is still useful for development and testing
- Real API data provides accurate CPC, search volume, and competition metrics

## Additional Resources

- [Google Ads API Documentation](https://developers.google.com/google-ads/api/docs/start)
- [OAuth 2.0 Setup Guide](https://developers.google.com/google-ads/api/docs/oauth/overview)
- [Keyword Planner API](https://developers.google.com/google-ads/api/docs/keyword-planning/overview)


