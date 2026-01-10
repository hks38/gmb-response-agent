# OAuth Troubleshooting Guide

## Common Error Messages and Solutions

### Error: "redirect_uri_mismatch"

**Problem:** The redirect URI in your `.env` doesn't match what's configured in Google Cloud Console.

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. Click your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, verify `http://localhost:3000/oauth2callback` is listed exactly (including the protocol and port)
4. If it's not there, add it and click **Save**
5. Wait a few minutes for changes to propagate
6. Try again

### Error: "access_denied" or "This app isn't verified"

**Problem:** The OAuth consent screen isn't properly configured or you need to add yourself as a test user.

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen**
2. Make sure the consent screen is configured:
   - Choose **External** (unless you have Google Workspace)
   - Fill in app name, user support email, developer contact
   - Under **Scopes**, add: `https://www.googleapis.com/auth/business.manage`
   - Under **Test users**, add your Google account email (the one that has access to your Business Profile)
   - Save and continue through all steps
3. If you see "This app isn't verified" warning:
   - Click **Advanced** → **Go to [Your App Name] (unsafe)**
   - This is safe for testing with your own account
4. Try the authorization flow again

### Error: "invalid_grant" when exchanging code

**Problem:** The authorization code has expired (they expire in ~10 minutes) or was already used.

**Solution:**
1. Start the OAuth flow again (`npm run get-refresh-token`)
2. Get a fresh authorization code
3. Use it immediately (don't wait)

### Error: "invalid_client" or "unauthorized_client"

**Problem:** The Client ID or Client Secret is incorrect.

**Solution:**
1. Verify your `.env` has the correct values:
   ```env
   GOOGLE_CLIENT_ID="166415910980-xxx.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="GOCSPX-xxx"
   ```
2. Get them from Google Cloud Console → **Credentials** → Click your OAuth client
3. Make sure there are no extra spaces or quotes in the values

### Error: "insufficient permissions" or API access denied

**Problem:** The Google Business Profile API isn't enabled or your account doesn't have access.

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Library**
2. Search for "Google Business Profile API" (formerly "My Business API")
3. Click it and make sure it's **Enabled**
4. Verify your Google account has manager/admin access to the Business Profile location
5. The account you use for OAuth must have access to the location

### Error: No refresh token returned

**Problem:** Google only issues refresh tokens on the first authorization or when `prompt=consent` is used.

**Solution:**
1. Make sure you're using the script: `npm run get-refresh-token`
2. The script automatically sets `prompt=consent` to force a refresh token
3. If you already authorized before, you may need to revoke access:
   - Go to [Google Account Security](https://myaccount.google.com/permissions)
   - Find your app and click **Remove Access**
   - Run `npm run get-refresh-token` again

### Getting "localhost refused to connect" after authorization

**This is normal!** You don't need the callback URL to work. Just copy the `code` parameter from the URL.

**Steps:**
1. After clicking "Allow" in the OAuth flow
2. You'll be redirected to something like:
   ```
   http://localhost:3000/oauth2callback?code=4/0Axxx...&scope=...
   ```
3. The page will fail to load (that's OK)
4. **Copy the entire `code` parameter value** (everything after `code=` and before `&`)
5. Paste it into the terminal when prompted

### Debugging Steps

If you're still having issues:

1. **Verify your `.env` file:**
   ```bash
   cat .env | grep GOOGLE
   ```

2. **Check the exact error message:**
   - Run `npm run get-refresh-token` again
   - Copy the full error message
   - Check the browser console if the error is in the OAuth flow

3. **Verify Google Cloud Console settings:**
   - OAuth consent screen is configured
   - You're added as a test user
   - Scopes include `https://www.googleapis.com/auth/business.manage`
   - Redirect URI matches exactly: `http://localhost:3000/oauth2callback`

4. **Try revoking and re-authorizing:**
   - Go to [Google Account Security](https://myaccount.google.com/permissions)
   - Remove access to your app
   - Run `npm run get-refresh-token` again

### Still Having Issues?

1. Make sure you're using the correct Google account (the one with Business Profile access)
2. Try in an incognito/private browser window
3. Clear browser cookies for accounts.google.com
4. Double-check all values match exactly (no trailing spaces, correct quotes)

