# Google Business Profile API Setup Guide

This guide walks you through obtaining the credentials needed for the Review Response Agent:
- `GOOGLE_ACCESS_TOKEN`
- `GOOGLE_LOCATION_ID`
- `GOOGLE_ACCOUNT_ID` (optional)

## Prerequisites

1. A Google account with access to Google Business Profile (formerly Google My Business)
2. A Google Cloud Project with the Google Business Profile API enabled

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click **"New Project"**
4. Enter a project name (e.g., "Dental Review Agent")
5. Click **"Create"**

## Step 2: Enable Google Business Profile API

1. In your Google Cloud project, go to **"APIs & Services" > "Library"**
2. Search for **"Google Business Profile API"** (formerly "My Business API")
   - ⚠️ **Important:** Do NOT enable "Business Profile Performance API" (that's for analytics only)
   - ⚠️ **Do NOT enable "My Business Business Information API"** (that's different)
   - You need the main **"Google Business Profile API"** or **"My Business API"** (legacy name)
3. Click on it and click **"Enable"**

## Step 3: Configure OAuth Consent Screen (Do This First!)

**📖 See [OAUTH_CONSENT_SCREEN_SETUP.md](OAUTH_CONSENT_SCREEN_SETUP.md) for detailed step-by-step instructions.**

Quick steps:
1. Go to **"APIs & Services" > "OAuth consent screen"**
2. Choose **"External"** (unless you have a Google Workspace)
3. Fill in app name, user support email
4. **Add scope**: `https://www.googleapis.com/auth/business.manage`
5. **Add test users**: Add your Google account email (critical!)
6. Save and continue through all steps

## Step 4: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services" > "Credentials"**
2. Click **"Create Credentials" > "OAuth client ID"**
3. Application type: **"Web application"**
4. Name: "Review Agent Client"
5. Authorized redirect URIs: Add `http://localhost:3000/oauth2callback` (or your callback URL)
6. Click **"Create"**
7. **Save the Client ID and Client Secret** (you'll need these)

## Step 5: Get an Access Token

You have two options:

### Option A: Using OAuth 2.0 Playground (Quick Testing)

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in top right
3. Check **"Use your own OAuth credentials"**
4. Enter your **Client ID** and **Client Secret** from Step 3
5. In the left panel, find **"Google Business Profile API v4"**
6. Expand it and check: `https://www.googleapis.com/auth/business.manage`
7. Click **"Authorize APIs"** (you'll sign in and grant permissions)
8. Click **"Exchange authorization code for tokens"**
9. Copy the **"Access token"** value → This is your `GOOGLE_ACCESS_TOKEN`

**Note:** This token expires in ~1 hour. For production, use Option B.

### Option B: Using a Refresh Token Flow (Production) ⭐ Recommended

This option provides long-lived authentication that automatically refreshes access tokens. Perfect for production use.

#### Step 4B.1: Get Client ID and Client Secret

You should already have these from Step 3. 

**If you have a `client_secret_*.json` file** (downloaded from Google Cloud Console):

1. Open the JSON file (it looks like: `{"web":{"client_id":"...","client_secret":"...",...}}`)
2. Extract the values:
   - `web.client_id` → Your `GOOGLE_CLIENT_ID`
   - `web.client_secret` → Your `GOOGLE_CLIENT_SECRET`
   - `web.redirect_uris[0]` → Usually `http://localhost:3000/oauth2callback` (this is your `GOOGLE_REDIRECT_URI`)

**Alternatively**, find them in [Google Cloud Console](https://console.cloud.google.com/):
1. Go to **APIs & Services** → **Credentials**
2. Click your OAuth 2.0 Client ID
3. Copy the **Client ID** and **Client secret**
4. Note the **Authorized redirect URIs** (should include `http://localhost:3000/oauth2callback`)

#### Step 4B.2: Add Credentials to .env

Add these to your `.env` file:

```env
GOOGLE_CLIENT_ID="166415910980-xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxx"
GOOGLE_REDIRECT_URI="http://localhost:3000/oauth2callback"
```

**Important:** The `GOOGLE_REDIRECT_URI` must exactly match what you configured in Step 3 (usually `http://localhost:3000/oauth2callback`).

#### Step 4B.3: Install Dependencies

Make sure you have the Google Auth Library installed:

```bash
npm install google-auth-library
```

#### Step 4B.4: Run the Refresh Token Setup Script

This script will guide you through getting a refresh token:

```bash
npm run get-refresh-token
```

The script will:
1. Generate an authorization URL
2. Ask you to open it in your browser
3. After you authorize, you'll be redirected to a callback URL with a code
4. Copy the `code` parameter from the callback URL
5. Paste it into the script
6. The script will exchange it for tokens and save them

**Detailed Steps:**

1. Run `npm run get-refresh-token`
2. You'll see an authorization URL printed - copy it
3. Open the URL in your browser (you must be signed into the Google account that has access to your Business Profile)
4. Click **"Allow"** to grant permissions
5. You'll be redirected to `http://localhost:3000/oauth2callback?code=...`
   - If you get a "localhost refused to connect" error, that's normal - just copy the `code` parameter from the URL
6. Copy everything after `code=` in the URL (the authorization code)
7. Paste it into the terminal when prompted
8. The script will save your tokens automatically

#### Step 4B.5: Add Refresh Token to .env

After running the script, it will print your refresh token. Add it to your `.env`:

```env
GOOGLE_REFRESH_TOKEN="1//0xxx..."  # Long-lived token from the script
```

#### Step 4B.6: How It Works

- **Access tokens** expire in ~1 hour and are automatically refreshed using the refresh token
- **Refresh tokens** are long-lived and don't expire (unless revoked)
- Tokens are cached in `data/google-tokens.json` for performance
- The system automatically refreshes tokens before they expire

#### Step 4B.7: Verify It's Working

Run the fetch script to test:

```bash
npm run fetch-reviews
```

You should see "Refreshing access token..." on the first run, then subsequent runs will use cached tokens.

**That's it!** You now have production-ready authentication that automatically refreshes.

**Note:** You can remove `GOOGLE_ACCESS_TOKEN` from `.env` if you're using the refresh token flow. The system will prioritize refresh token flow if credentials are provided.

## Step 6: Get Your Location ID

1. Go to [Google Business Profile](https://business.google.com/)
2. Select your business location
3. The Location ID is in the URL or you can get it via API:

### Method 1: From the API directly

Run this curl command (replace `YOUR_ACCESS_TOKEN`):

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://mybusiness.googleapis.com/v4/accounts"
```

This returns your accounts. Then:

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  "https://mybusiness.googleapis.com/v4/accounts/ACCOUNT_ID/locations"
```

Look for the `name` field in the response - it will be like `locations/1234567890`

### Method 2: From Google Business Profile Manager

1. In Google Business Profile, go to your location
2. The Location ID might be visible in the URL or settings
3. Or use the API method above

## Step 7: Get Account ID (Optional)

The Account ID is usually in the format `accounts/123456`. You can find it:

1. From the API response in Step 5 (Method 1)
2. Or it's often the first part of your Location ID path

## Step 8: Add to .env File

Create or edit your `.env` file:

```env
GOOGLE_ACCESS_TOKEN="ya29.a0AfH6SMBx..."  # From Step 4
GOOGLE_LOCATION_ID="locations/1234567890"  # From Step 5
GOOGLE_ACCOUNT_ID="accounts/123456"  # From Step 6 (optional)
```

## Testing Your Credentials

Run the fetch script to test:

```bash
npm run fetch-reviews
```

If successful, you should see:
- "Fetching reviews..."
- "Fetched X reviews from Google."
- "Processed review..."

## Troubleshooting

### "Invalid credentials" error
- Check that your access token hasn't expired (they expire in ~1 hour)
- Regenerate using OAuth 2.0 Playground
- Ensure the token has `business.manage` scope

### "Location not found" error
- Verify `GOOGLE_LOCATION_ID` format: should be `locations/1234567890` (not just the number)
- Ensure your OAuth account has access to this location

### "Insufficient permissions" error
- Make sure you enabled the Google Business Profile API in your Cloud project
- Verify the OAuth scope includes `https://www.googleapis.com/auth/business.manage`
- Check that your Google account has manager/admin access to the business profile

## Production Considerations

For production use:

1. **Implement refresh token rotation** - Access tokens expire quickly
2. **Use a service account** - More secure for server-to-server auth
3. **Store credentials securely** - Use a secrets manager (AWS Secrets Manager, Google Secret Manager, etc.)
4. **Set up monitoring** - Alert on token expiration or API errors
5. **Rate limiting** - The API has rate limits; the code includes basic rate limiting

## Additional Resources

- [Google Business Profile API Documentation](https://developers.google.com/my-business/content/overview)
- [OAuth 2.0 for Web Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Business Profile API Reference](https://developers.google.com/my-business/reference/rest)

