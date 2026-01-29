# Troubleshooting Guide - BusinessAI Suite

Common issues, error messages, and solutions for BusinessAI Suite.

## Table of Contents

1. [Authentication Issues](#authentication-issues)
2. [Google Business Profile Connection](#google-business-profile-connection)
3. [Review Management](#review-management)
4. [Database Issues](#database-issues)
5. [LLM/AI Issues](#llmai-issues)
6. [Email Notifications](#email-notifications)
7. [Scheduler/Automation](#schedulerautomation)
8. [Performance Issues](#performance-issues)
9. [General Errors](#general-errors)

## Authentication Issues

### "Not authenticated" or Redirected to Login

**Symptoms:**
- Redirected to `/login` when accessing dashboard
- "Not authenticated" error messages

**Solutions:**

1. **Check Session Cookie:**
   - Ensure cookies are enabled in browser
   - Clear cookies and try logging in again
   - Check browser console for cookie errors

2. **Verify SESSION_SECRET:**
   ```bash
   # In .env, ensure SESSION_SECRET is set
   SESSION_SECRET="your-secret-here"
   ```

3. **Check Session Expiry:**
   - Sessions may expire after inactivity
   - Simply log in again

### "Invalid state error" during Google OAuth

**Symptoms:**
- Error during Google Business Profile connection
- "invalid state" error message

**Solutions:**

1. **Verify Redirect URI:**
   ```env
   # In .env
   GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
   ```

2. **Match in Google Cloud Console:**
   - Go to Google Cloud Console → APIs & Services → Credentials
   - Ensure Authorized Redirect URI matches exactly
   - Include both `http://` and `https://` if testing both

3. **Clear State Cookie:**
   - Clear browser cookies
   - Try connection again

### Magic Link Not Working

**Symptoms:**
- Email not received
- Link expired or invalid

**Solutions:**

1. **Check Email Configuration:**
   - Verify SMTP settings in `.env`
   - Test SMTP connection

2. **Check Email Folder:**
   - Check spam/junk folder
   - Verify email address is correct

3. **Link Expiry:**
   - Magic links expire after 15 minutes
   - Request a new link

## Google Business Profile Connection

### "Missing ENCRYPTION_KEY" Error

**Symptoms:**
- Error: "Missing ENCRYPTION_KEY (base64, 32 bytes) for token encryption"
- Cannot connect Google Business Profile

**Solutions:**

1. **Generate Encryption Key:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

2. **Add to .env:**
   ```env
   ENCRYPTION_KEY="<generated-key-here>"
   ```

3. **Restart Server:**
   ```bash
   npm run dev
   ```

### "Request had invalid authentication credentials"

**Symptoms:**
- 401 Unauthorized errors
- Cannot fetch reviews or posts

**Solutions:**

1. **Refresh Token Expired:**
   ```bash
   # Get new refresh token
   npm run get-refresh-token
   ```
   - Update `GOOGLE_REFRESH_TOKEN` in `.env`

2. **Check Token Format:**
   - Ensure `GOOGLE_REFRESH_TOKEN` starts with `1//`
   - No extra spaces or quotes

3. **Verify OAuth Scopes:**
   - Required scope: `https://www.googleapis.com/auth/business.manage`
   - Check in Google Cloud Console

4. **Check Token Expiry:**
   - Google refresh tokens can expire if unused
   - Re-authorize if token is too old

### "Invalid `prisma.competitor.findMany()` invocation... table does not exist"

**Symptoms:**
- Database errors about missing tables
- Features not working

**Solutions:**

1. **Run Migrations:**
   ```bash
   npx prisma migrate deploy
   ```

2. **Check Database:**
   ```bash
   npx prisma studio
   # Verify tables exist
   ```

3. **Reset Database (⚠️ Data Loss):**
   ```bash
   npx prisma migrate reset
   npx prisma migrate deploy
   ```

## Review Management

### "Error loading reviews: (reviews || []).forEach is not a function"

**Symptoms:**
- Reviews page shows error
- Reviews not displaying

**Solutions:**

1. **Check API Response:**
   - Open browser DevTools → Network tab
   - Check `/api/reviews` response
   - Should return `{ success: true, reviews: [...] }`

2. **Check Authentication:**
   - Ensure logged in
   - Check session cookie

3. **Clear Browser Cache:**
   - Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
   - Clear cache and cookies

### Reviews Not Fetching

**Symptoms:**
- "Fetch Reviews" button does nothing
- No new reviews appearing

**Solutions:**

1. **Check Google Connection:**
   - Verify GBP is connected in Settings
   - Check connection status

2. **Check API Credentials:**
   - Verify `GOOGLE_REFRESH_TOKEN` is valid
   - Test token manually

3. **Check Rate Limits:**
   - Google API has rate limits
   - Wait a few minutes and try again

4. **Check Location ID:**
   - Verify `GOOGLE_LOCATION_ID` is correct format: `locations/1234567890`
   - Get correct ID: `npm run get-location-id`

### AI Analysis Not Working

**Symptoms:**
- Reviews not being analyzed
- No reply drafts generated

**Solutions:**

1. **Check LLM Configuration:**
   ```env
   # Verify OpenAI key
   OPENAI_API_KEY="sk-..."
   
   # Or Ollama
   OLLAMA_API_URL="http://localhost:11434"
   OLLAMA_MODEL="llama3"
   ```

2. **Test LLM Connection:**
   ```bash
   npm run test-ollama  # If using Ollama
   ```

3. **Check API Quota:**
   - OpenAI: Check usage at platform.openai.com
   - Ollama: Ensure server is running (`ollama serve`)

## Database Issues

### "Migration failed" or "Database locked"

**Symptoms:**
- Cannot run migrations
- Database errors

**Solutions:**

1. **Close Prisma Studio:**
   - If `npx prisma studio` is open, close it
   - SQLite doesn't allow multiple connections

2. **Check File Permissions:**
   ```bash
   ls -la prisma/dev.db
   # Ensure writable
   ```

3. **Backup and Reset (⚠️ Data Loss):**
   ```bash
   cp prisma/dev.db prisma/dev.db.backup
   npx prisma migrate reset
   ```

### Database File Missing or Corrupted

**Symptoms:**
- "Database file not found"
- Application won't start

**Solutions:**

1. **Recreate Database:**
   ```bash
   npx prisma migrate deploy
   ```

2. **Check DATABASE_URL:**
   ```env
   DATABASE_URL="file:./prisma/dev.db"
   ```

3. **If Corrupted:**
   ```bash
   rm prisma/dev.db
   npx prisma migrate deploy
   # Data will be lost - restore from backup if available
   ```

## LLM/AI Issues

### "OpenAI API error: Insufficient quota"

**Symptoms:**
- AI features not working
- Quota exceeded errors

**Solutions:**

1. **Set Up Ollama Fallback:**
   ```env
   OLLAMA_API_URL="http://localhost:11434"
   OLLAMA_MODEL="llama3"
   ```

2. **Start Ollama:**
   ```bash
   ollama serve
   ollama pull llama3
   ```

3. **System auto-falls back** to Ollama when OpenAI fails

### Slow AI Responses

**Symptoms:**
- Reviews taking long to analyze
- Timeout errors

**Solutions:**

1. **Check Network:**
   - Slow internet can cause delays
   - Check API response times

2. **Use Faster Model:**
   ```env
   OPENAI_MODEL="gpt-4o-mini"  # Faster than gpt-4
   ```

3. **Check Ollama:**
   - If using Ollama, ensure server has enough resources
   - Local LLM may be slower than cloud

## Email Notifications

### Emails Not Sending

**Symptoms:**
- Scheduled emails not arriving
- No notification emails

**Solutions:**

1. **Check SMTP Settings:**
   ```env
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER="your-email@gmail.com"
   SMTP_PASS="your-app-password"  # Not regular password!
   ```

2. **Gmail App Password:**
   - For Gmail, use App Password (not regular password)
   - Generate in Google Account → Security → 2-Step Verification → App passwords

3. **Test SMTP:**
   - Use email testing tool
   - Check server logs for errors

4. **Check Recipient:**
   ```env
   EMAIL_TO="recipient@example.com"
   ```

### Emails Going to Spam

**Symptoms:**
- Emails received but in spam folder

**Solutions:**

1. **Check Sender:**
   - Use reputable email provider
   - Verify sender domain

2. **SPF/DKIM Records:**
   - Configure SPF and DKIM for your domain
   - Improves email deliverability

## Scheduler/Automation

### Scheduled Jobs Not Running

**Symptoms:**
- Daily reviews not fetching
- Weekly posts not generating

**Solutions:**

1. **Check Scheduler Enabled:**
   - In Settings → Scheduler
   - Ensure "Enable Scheduler" is checked

2. **Check Environment:**
   ```env
   DISABLE_SCHEDULER=false  # Should be false or not set
   ```

3. **Check Cron Expressions:**
   ```env
   DAILY_REVIEWS_CRON="0 19 * * *"  # Daily at 7 PM ET
   ```

4. **Verify Timezone:**
   ```env
   SCHEDULER_TZ="America/New_York"
   ```

5. **Check Server Logs:**
   - Look for scheduler errors
   - Verify cron jobs are firing

### Jobs Running at Wrong Time

**Symptoms:**
- Jobs running at unexpected times

**Solutions:**

1. **Check Timezone:**
   ```env
   SCHEDULER_TZ="America/New_York"  # Adjust to your timezone
   ```

2. **Verify Cron Format:**
   - Format: `minute hour day-of-month month day-of-week`
   - Example: `0 19 * * *` = 7:00 PM daily

3. **Test Cron Expression:**
   - Use online cron tester
   - Verify timing matches expectations

## Performance Issues

### Slow Page Loads

**Symptoms:**
- Dashboard loading slowly
- API requests timing out

**Solutions:**

1. **Check Database Size:**
   ```bash
   # Check database file size
   ls -lh prisma/dev.db
   ```

2. **Optimize Queries:**
   - Check for N+1 queries
   - Use Prisma includes for related data

3. **Add Indexes:**
   - Add indexes in Prisma schema for frequently queried fields

### Memory Issues

**Symptoms:**
- Application crashes
- "Out of memory" errors

**Solutions:**

1. **Check Node Memory:**
   ```bash
   # Increase Node memory limit
   node --max-old-space-size=4096 dist/server.js
   ```

2. **Reduce Batch Sizes:**
   - Process fewer reviews/posts at once
   - Add delays between operations

## General Errors

### "locationIdInternal is required"

**Symptoms:**
- Error when accessing features
- Competitive insights not working

**Solutions:**

1. **Check Tenant Context:**
   - Ensure logged in
   - Verify active business is set

2. **Check Default Location:**
   - Ensure business has at least one location
   - System auto-creates default location if missing

### "Cannot read property X of undefined"

**Symptoms:**
- JavaScript errors in console
- Features not working

**Solutions:**

1. **Check Browser Console:**
   - Open DevTools → Console
   - Look for specific error messages

2. **Clear Cache:**
   - Hard refresh (Ctrl+Shift+R)
   - Clear browser cache

3. **Check API Responses:**
   - Network tab → Check API responses
   - Verify data structure matches expectations

### Port Already in Use

**Symptoms:**
- "Port 3000 already in use"
- Server won't start

**Solutions:**

1. **Find Process:**
   ```bash
   # macOS/Linux
   lsof -ti:3000 | xargs kill -9
   
   # Or use different port
   PORT=3001 npm run dev
   ```

2. **Update .env:**
   ```env
   PORT=3001
   ```

## Getting Additional Help

### Debug Mode

Enable detailed logging:

```bash
DEBUG=* npm run dev
```

### Check Logs

1. **Server Logs**: Console output during `npm run dev`
2. **Browser Console**: DevTools → Console tab
3. **Network Tab**: DevTools → Network tab for API calls

### Database Inspection

```bash
npx prisma studio
# Opens database GUI at http://localhost:5555
```

### Common Checklist

When troubleshooting, verify:

- [ ] `.env` file exists and is properly configured
- [ ] Database migrations are up to date
- [ ] Google OAuth credentials are correct
- [ ] LLM API keys are valid
- [ ] Server is running (`npm run dev`)
- [ ] Browser cookies are enabled
- [ ] Network connectivity is working

### Still Having Issues?

1. Check existing documentation:
   - [README.md](README.md)
   - [DEVELOPERS_GUIDE.md](DEVELOPERS_GUIDE.md)
   - [USER_GUIDE.md](USER_GUIDE.md)

2. Review error messages carefully - they often contain specific guidance

3. Check GitHub issues (if using GitHub) for similar problems

4. Contact your system administrator or support team

---

**Remember**: Most issues can be resolved by checking configuration files, verifying credentials, and ensuring all services are running properly.

