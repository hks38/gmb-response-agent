# OAuth Web Flow Setup Guide

## Overview

You can now connect Google Business Profile directly from the web UI without running CLI commands! Users click a button, authorize in their browser, and tokens are automatically saved.

## Features

- ✅ **Web-based OAuth flow** - No CLI commands needed
- ✅ **One-click connect** - "Connect Google Business Profile" button in UI
- ✅ **Automatic token refresh** - Tokens auto-refresh when expired
- ✅ **Connection status** - See if Google is connected at a glance
- ✅ **Disconnect option** - Remove connection if needed

## Setup Instructions

### Step 1: Update Redirect URI in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click your **OAuth 2.0 Client ID**
4. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
5. **For production**, also add:
   ```
   https://yourdomain.com/api/auth/google/callback
   ```
6. Click **Save**

### Step 2: Update .env File

Make sure your `.env` has the correct redirect URI:

```env
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

**Important**: This must **exactly match** what you configured in Google Cloud Console (including `http://` vs `https://` and the port).

### Step 3: Use the Web UI

1. Start your server:
   ```bash
   npm run dev
   ```

2. Open your browser to `http://localhost:3000`

3. Look for the **"🔗 Connect Google Business Profile"** button (visible when not connected)

4. Click the button - you'll be redirected to Google's OAuth consent screen

5. Sign in with your Google account and authorize access

6. You'll be redirected back with a success message

7. That's it! Your refresh token is now saved and will be used automatically.

## How It Works

### User Flow:
```
1. User clicks "Connect Google Business Profile" button
   ↓
2. Browser redirects to: /api/auth/google/connect
   ↓
3. Server generates OAuth URL and redirects to Google
   ↓
4. User authorizes on Google's site
   ↓
5. Google redirects back: /api/auth/google/callback?code=xxx
   ↓
6. Server exchanges code for tokens
   ↓
7. Refresh token saved to data/google-tokens.json
   ↓
8. User redirected back to dashboard with success message
```

### API Endpoints:

- **GET `/api/auth/google/connect`** - Initiates OAuth flow (redirects to Google)
- **GET `/api/auth/google/callback`** - Handles OAuth callback from Google
- **GET `/api/auth/google/status`** - Checks connection status
- **POST `/api/auth/google/disconnect`** - Removes stored tokens

## Connection Status

The UI automatically checks connection status on page load and displays:
- ✅ **Connected** - Google Business Profile is connected (refresh token available)
- ✗ **Not Connected** - No refresh token found

You can click the status badge or buttons to connect/disconnect.

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Problem**: The redirect URI in `.env` doesn't match Google Cloud Console.

**Solution**: 
1. Check `.env`: `GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback`
2. Check Google Cloud Console → OAuth Client → Authorized redirect URIs
3. They must match exactly (including `http://` and port)

### Error: "invalid_grant"

**Problem**: Authorization code expired or already used.

**Solution**: Try connecting again - get a fresh authorization code.

### Error: "no_refresh_token_received"

**Problem**: Google didn't return a refresh token.

**Solution**: 
1. Make sure `prompt=consent` is in the OAuth URL (it's set automatically)
2. If you previously authorized, revoke access at https://myaccount.google.com/permissions
3. Try connecting again

### Connection Status Shows "Not Connected"

**Possible causes**:
1. No refresh token in `data/google-tokens.json`
2. No `GOOGLE_REFRESH_TOKEN` in `.env`
3. Token file is corrupted

**Solution**: Click "Connect Google Business Profile" to go through OAuth flow again.

## Migration from CLI Script

If you were using `npm run get-refresh-token`, you can now:
- Use the web UI instead (recommended)
- Or continue using CLI script if you prefer

Both methods save tokens to the same location (`data/google-tokens.json`).

## Multi-Tenant Support (Future)

When you implement multi-tenant architecture:
- Each business will have its own refresh token stored in database
- OAuth flow will pass `businessId` in the `state` parameter
- Callback will save token to `BusinessCredential` table for that business
- Each business manages its own connection independently

## Security Notes

- Refresh tokens are stored in `data/google-tokens.json` (file-based for now)
- In production/multi-tenant, tokens should be encrypted at rest
- Never commit `data/google-tokens.json` to git (it's in `.gitignore`)
- Use HTTPS in production
- Regularly rotate refresh tokens (revoke and reconnect)

## Next Steps

1. ✅ Update redirect URI in Google Cloud Console
2. ✅ Update `GOOGLE_REDIRECT_URI` in `.env`
3. ✅ Test the web-based flow by clicking "Connect Google Business Profile"
4. ✅ Verify you can fetch reviews after connecting

The web-based OAuth flow is now fully functional!


