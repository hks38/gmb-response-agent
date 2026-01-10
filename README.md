# Google Business Profile Review Response Agent

An AI-powered agent that automatically fetches Google Business Profile reviews, analyzes them with OpenAI/Llama 3, and provides a lightweight approval UI for dental practices.

## Features

- Fetch latest Google Business Profile reviews (single location) and deduplicate by `reviewId`.
- AI analysis per review: sentiment, urgency, topics, suggested actions, risk flags, reply draft.
- **Multi-LLM support**: Uses OpenAI by default, automatically falls back to Ollama/Llama 3 when quota is exceeded (see `OLLAMA_SETUP.md`).
- **Website context integration**: Automatically fetches and uses practice information from your website (e.g., services, location, USPs) to generate more authentic, relevant replies.
- Approval logic: `Needs Approval` when HIPAA risk, negative sentiment, or rating <= 3; otherwise `Auto-Approved`.
- Minimal admin UI (served by Express) to filter, view, edit, and copy replies.
- SQLite via Prisma; includes schema and initial migration.

## Setup

```bash
cd gmbResponseAgent
npm install
cp env.example .env   # fill with your secrets
npx prisma generate
npx prisma migrate deploy
```

Environment variables (see `env.example`):
- `DATABASE_URL` (default `file:./prisma/dev.db`)
- **LLM Configuration**:
  - `OPENAI_API_KEY`, `OPENAI_MODEL` (primary - defaults to `gpt-4o-mini`)
  - `OLLAMA_API_URL`, `OLLAMA_MODEL` (optional fallback - for Llama 3, see `OLLAMA_SETUP.md`)
- **Google Auth** (choose one):
  - Option A (Testing): `GOOGLE_ACCESS_TOKEN` (expires in ~1 hour, get from OAuth Playground)
  - Option B (Production): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (auto-refreshes, run `npm run get-refresh-token`)
- `GOOGLE_LOCATION_ID` (optional - will auto-discover if not set)
- `GOOGLE_ACCOUNT_ID` (optional - not required, only used during auto-discovery)
- `WEBSITE_URL` (default `https://malama.dental` - used for context in replies)
- `PORT`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`

## Running

- API + UI: `npm run dev` (ts-node-dev) or `npm run build && npm start`
- Manual ingest + analyze: `npm run fetch-reviews`
- Refresh website context cache: `npm run refresh-website` (cached for 24 hours, auto-fetched on first use)
- Suggested cron (every 30m):
  ```
  */30 * * * * cd /path/to/gmbResponseAgent && /usr/local/bin/node ./node_modules/.bin/ts-node scripts/fetchReviews.ts >> logs/gbp-job.log 2>&1
  ```

## Website Context Integration

The agent automatically fetches practice information from your website to make replies more authentic and relevant. It extracts:
- Practice name, location, contact info
- Services offered
- Unique selling points and practice values
- Practice description

This context is:
- **Cached for 24 hours** to avoid excessive scraping
- **Automatically included** in every review analysis prompt
- **Used naturally** in reply drafts (e.g., referencing specific services mentioned on your site)

To manually refresh the cache: `npm run refresh-website`

## LLM Fallback Support (Llama 3/Ollama)

**📖 See [OLLAMA_SETUP.md](OLLAMA_SETUP.md) for detailed setup instructions.**

The agent automatically falls back to Ollama/Llama 3 when OpenAI quota is exceeded. This allows you to continue processing reviews even when hitting API limits.

**Quick Setup:**
1. Install Ollama: `brew install ollama` (or download from ollama.ai)
2. Start server: `ollama serve`
3. Pull model: `ollama pull llama3`
4. Add to `.env`: `OLLAMA_API_URL="http://localhost:11434"` and `OLLAMA_MODEL="llama3"`

The system will automatically use Ollama when OpenAI fails - no code changes needed!

## Google OAuth Setup

**📖 See [GOOGLE_BUSINESS_PROFILE_SETUP.md](GOOGLE_BUSINESS_PROFILE_SETUP.md) for detailed step-by-step instructions.**

**Quick Setup:**

**Option A (Testing):** Get a short-lived access token from [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) → Set `GOOGLE_ACCESS_TOKEN` in `.env`

**Option B (Production - Recommended):** 
1. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `.env` (from Google Cloud Console)
2. Run `npm run get-refresh-token` to get a refresh token
3. Add `GOOGLE_REFRESH_TOKEN` to `.env`
4. Tokens automatically refresh - no manual updates needed!

**Location ID:** Format `locations/1234567890` - get from Google Business Profile API (see setup guide).

**Base API:** `https://mybusiness.googleapis.com/v4/{locationId}/reviews` with scope `https://www.googleapis.com/auth/business.manage`

## Admin UI

- Served from `public/index.html` by Express (`/api/reviews` backend).
- Filters by status/sentiment/rating, shows AI analysis, and lets you edit + save the reply draft or copy it to clipboard.
- Reply style rules live in `src/prompts/reviewPrompt.ts`; OpenAI call in `src/services/analysisService.ts`.

## SEO-Targeted Posts on Google Business Profile

Create and publish SEO-optimized posts directly to your Google Business Profile to boost local visibility. The system now **automatically uses weekly keyword reports** to generate posts based on trending keywords in your area!

### Features

- **AI-Generated Content**: Uses LLM (OpenAI/Ollama) to create engaging, SEO-optimized post content
- **Local SEO Integration**: Naturally includes local keywords (e.g., "Long Valley dentist", "family dentist")
- **Website Context**: Uses practice information from your website for authentic, relevant posts
- **Multiple Post Types**: Support for STANDARD, EVENT, OFFER, and ALERT posts
- **Call-to-Action Buttons**: Includes CTAs like "Book Appointment", "Learn More", etc.

### Usage

**Smart Post Generation (Recommended):**
Automatically uses weekly keyword report data when available, falls back to custom topic if no report exists.

```bash
# Uses weekly report keywords (if available), otherwise uses default topic
npm run generate-smart-post

# Use custom topic as fallback (only if no report exists)
npm run generate-smart-post "Teeth whitening special"

# Generate multiple posts from weekly report
npm run generate-smart-post "" STANDARD LEARN_MORE true 3

# Force custom topic (ignore weekly report)
npm run generate-smart-post "New patient special" STANDARD BOOK false
```

**Legacy Single Post (still available):**
```bash
# Create post with specific topic (ignores weekly report)
npm run create-seo-post "Dental cleaning tips for healthy teeth"
npm run create-seo-post "New patient special" OFFER SHOP
```

**List existing posts:**
```bash
npm run list-posts
```

### How Smart Post Generation Works

1. **Checks for Weekly Report**: Looks for the latest weekly keyword report in the database
2. **Uses Trending Keywords**: If report exists, selects top trending keywords to generate posts
3. **Fallback to Topic**: If no report exists, uses provided topic or default "General dental care"
4. **Multiple Posts**: Can generate multiple posts (one per keyword) from the weekly report

**Workflow:**
```bash
# Step 1: Generate weekly keyword report (Monday)
npm run weekly-keyword-report

# Step 2: Generate posts based on trending keywords (throughout the week)
npm run generate-smart-post  # Automatically uses report keywords
```

### Post Types

- **STANDARD**: Regular informational posts
- **EVENT**: Posts about upcoming events
- **OFFER**: Promotional posts with special offers
- **ALERT**: Important announcements

### Call-to-Action Options

- `BOOK` - Book an appointment
- `ORDER` - Place an order
- `SHOP` - Shop now
- `LEARN_MORE` - Learn more
- `SIGN_UP` - Sign up
- `CALL` - Call us

### Example

```bash
# Create a standard post about dental services
npm run create-seo-post "Comprehensive dental care services"

# Create an offer post
npm run create-seo-post "New patient special - 20% off cleaning" OFFER SHOP

# Create an event post
npm run create-seo-post "Open house event this Saturday" EVENT LEARN_MORE
```

The system automatically:
- Generates SEO-optimized content with natural keyword inclusion
- Uses practice information from your website
- Includes appropriate call-to-action buttons
- Posts directly to your Google Business Profile

## Documentation

- **[GOOGLE_BUSINESS_PROFILE_SETUP.md](GOOGLE_BUSINESS_PROFILE_SETUP.md)** - Complete Google OAuth setup guide
- **[OLLAMA_SETUP.md](OLLAMA_SETUP.md)** - Llama 3/Ollama fallback setup
- **[HOW_TO_FIND_LOCATION_ID.md](HOW_TO_FIND_LOCATION_ID.md)** - Finding your Google Business Profile Location ID
- **[WHICH_APIS_TO_ENABLE.md](WHICH_APIS_TO_ENABLE.md)** - Which Google APIs to enable
- **[TROUBLESHOOTING_OAUTH.md](TROUBLESHOOTING_OAUTH.md)** - OAuth troubleshooting guide
- **[TROUBLESHOOTING_REVIEWS_API.md](TROUBLESHOOTING_REVIEWS_API.md)** - Reviews API troubleshooting guide

## Project Structure

```
gmbResponseAgent/
├── src/
│   ├── server.ts              # Express server
│   ├── routes/
│   │   └── reviews.ts         # API routes
│   ├── services/
│   │   ├── analysisService.ts # OpenAI/Llama analysis
│   │   ├── llmService.ts      # Unified LLM service with fallback
│   │   ├── googleReviews.ts   # Google API client
│   │   ├── googleAuth.ts      # OAuth token management
│   │   ├── websiteContext.ts  # Website context caching
│   │   └── websiteScraper.ts  # Website scraping
│   ├── prompts/
│   │   └── reviewPrompt.ts    # LLM prompt template
│   ├── db/
│   │   └── client.ts          # Prisma client
│   └── types.ts               # TypeScript types
├── scripts/
│   ├── fetchReviews.ts        # Main fetch + analyze script
│   ├── getRefreshToken.ts     # OAuth token setup
│   ├── getLocationId.ts       # Location ID discovery
│   ├── refreshWebsiteContext.ts # Manual context refresh
│   └── updateReply.ts         # Manual reply update script
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Database migrations
├── public/
│   └── index.html             # Admin UI
├── data/
│   ├── google-tokens.json     # OAuth tokens (auto-generated)
│   └── website-context.json   # Website context cache
├── package.json
├── tsconfig.json
├── env.example
└── README.md                  # This file
```

