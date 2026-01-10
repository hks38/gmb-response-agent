# How to Configure OAuth Consent Screen

## Step-by-Step Guide

### Step 1: Go to OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Make sure you have the correct project selected (the one with your OAuth credentials)
3. In the left sidebar, click **"APIs & Services"**
4. Click **"OAuth consent screen"**

### Step 2: Choose User Type

1. You'll see two options:
   - **Internal** (only for Google Workspace accounts)
   - **External** (for personal Gmail accounts)
2. **Choose "External"** (unless you're using Google Workspace)
3. Click **"Create"**

### Step 3: Fill in App Information

Fill in the required fields:

1. **App name**: Enter something like "Dental Review Agent" or "Review Response Agent"
2. **User support email**: Select your email address from the dropdown
3. **App logo** (optional): You can skip this
4. **App domain** (optional): You can skip this
5. **Application home page**: Enter your website URL (e.g., `https://malama.dental`)
6. **Application privacy policy link** (optional): Can leave blank for testing
7. **Application terms of service link** (optional): Can leave blank for testing
8. **Authorized domains**: Add `localhost` and your domain if you have one

Click **"Save and Continue"**

### Step 4: Add Scopes

This is where you add the Google Business Profile API scope:

1. Click **"Add or Remove Scopes"**
2. In the filter/search box, type: `business.manage`
3. You should see: `https://www.googleapis.com/auth/business.manage`
4. **Check the box** next to it
5. Click **"Update"** at the bottom
6. Click **"Save and Continue"**

### Step 5: Add Test Users ⭐ Important!

This is critical - you must add yourself as a test user:

1. Under **"Test users"**, click **"+ ADD USERS"**
2. Enter your **Google account email address** (the one you'll use to authorize the app)
3. Click **"Add"**
4. Your email should now appear in the test users list
5. Click **"Save and Continue"**

**Important Notes:**
- The email you add here must be the same one you use when authorizing
- This email must have access to your Google Business Profile
- You can add multiple test users if needed

### Step 6: Review and Summary

1. Review all the information you entered
2. Click **"Back to Dashboard"**

### Step 7: Verify Configuration

1. You should now see your OAuth consent screen dashboard
2. Check that:
   - ✅ Your app name is listed
   - ✅ Status shows "Testing" (for external apps in testing mode)
   - ✅ Test users list includes your email
   - ✅ Scopes include `https://www.googleapis.com/auth/business.manage`

## What Happens When You Authorize

When you run `npm run get-refresh-token` and click the authorization URL:

1. You'll see a Google sign-in page
2. You might see a warning: **"This app isn't verified"**
   - This is normal for apps in testing mode
   - Click **"Advanced"**
   - Click **"Go to [Your App Name] (unsafe)"**
   - This is safe - it's your own app
3. You'll see the consent screen asking for permission to "Manage your business listings on Google"
4. Click **"Allow"**
5. You'll be redirected to `http://localhost:3000/oauth2callback?code=...`
6. Copy the `code` parameter from the URL

## Troubleshooting

### "This app isn't verified" Warning

This is normal for apps in testing mode. To proceed:
1. Click **"Advanced"**
2. Click **"Go to [Your App Name] (unsafe)"**
3. You can safely proceed - it's your own app

### "Error 403: access_denied"

This usually means:
- You're not added as a test user, OR
- You're using a different Google account than the one added as a test user

**Fix:**
- Make sure the email you're using matches exactly what's in the test users list
- Add the correct email as a test user

### Can't Find the Scope

If you can't find `https://www.googleapis.com/auth/business.manage`:
1. Make sure you've enabled the **Google Business Profile API** in your project
2. Go to **APIs & Services** → **Library**
3. Search for "Google Business Profile API"
4. Click it and make sure it's **Enabled**
5. Then go back to OAuth consent screen and try again

## Quick Checklist

Before running `npm run get-refresh-token`, make sure:

- [ ] OAuth consent screen is configured (User Type = External)
- [ ] App information is filled in
- [ ] Scope `https://www.googleapis.com/auth/business.manage` is added
- [ ] Your email is added to Test users
- [ ] Google Business Profile API is enabled in your project
- [ ] You're using the same email that's in the test users list

