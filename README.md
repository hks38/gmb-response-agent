# BusinessAI Suite

A comprehensive, AI-powered platform for managing Google Business Profile reviews, generating SEO-optimized posts, conducting keyword research, competitive analysis, and automating business intelligence workflows for multi-tenant businesses.

## 🚀 Overview

BusinessAI Suite is a full-featured SaaS platform that helps businesses manage their online presence, respond to reviews intelligently, track competitors, analyze keywords, and automate marketing tasks. Built with multi-tenant architecture and role-based access control (RBAC), it supports multiple businesses and teams.

## ✨ Key Features

### 📝 Review Management
- **Automated Review Fetching**: Automatically syncs reviews from Google Business Profile
- **AI-Powered Analysis**: Analyzes sentiment, urgency, topics, and generates contextual reply drafts
- **HIPAA Compliance Checks**: Automatic compliance guardrails for healthcare practices
- **Bulk Actions**: Approve and post multiple replies with rate limiting protection
- **Quality Controls**: Language detection, variant generation, and signature customization

### 📊 Competitive Intelligence
- **Smart Competitor Discovery**: AI-verified competitor discovery with multi-stage filtering
- **Map Visualization**: Interactive map showing all competitor locations with search radius
- **Comprehensive Website Analysis**: AI-powered SEO, content, UX analysis with specialty services and insurance carrier detection
- **Full Website Scraping**: Scrapes entire competitor websites via sitemap or link crawling
- **Specialty Services Detection**: Identifies advanced procedures (veneers, implants, all-on-4, all-on-x, etc.)
- **Insurance Carrier Analysis**: Detects accepted insurance companies from competitor websites
- **Keyword Overlap**: Identify shared keywords and ranking opportunities
- **Velocity Tracking**: Monitor competitor review and rating trends over time
- **Community Mapping**: Dynamic maps with employers, hospitals, schools, and demographic data
- **Market Opportunities**: Identify competitor clusters and coverage gaps

### 📈 SEO & Keyword Research
- **Trending Keywords**: Discover trending keywords based on Google Trends and SerpAPI
- **Ranking Tracking**: Track GBP (Maps) and website (organic) rankings
- **Weekly Reports**: Automated weekly keyword trend reports
- **Competitor Comparison**: Compare rankings against competitors
- **Geographic Keyword Analysis**: Identify optimal marketing areas based on keyword costs and competition

### 📱 Google Business Profile Posts
- **AI-Generated Content**: SEO-optimized posts with local keyword integration
- **Smart Post Generation**: Uses keyword trends for relevant content
- **Multiple Post Types**: STANDARD, EVENT, OFFER, and ALERT posts
- **CTA Buttons**: Book, Order, Shop, Learn More, Sign Up, Call
- **Image Generation**: AI-generated post images (optional)
- **Duplicate Prevention**: Automatically avoids repeating topics from recent posts

### 🤖 Automation & Scheduling
- **Daily Review Sync**: Automatically fetch and analyze new reviews
- **Automated Email Notifications**: Email alerts for review approvals
- **Weekly Post Generation**: Automated SEO-optimized post creation
- **Monthly Executive Reports**: Comprehensive business intelligence reports

### 👥 Multi-Tenant & Team Management
- **Multiple Businesses**: Manage multiple businesses in one account
- **Team Collaboration**: Invite team members with role-based access
- **RBAC**: Owner, Admin, and Staff roles with granular permissions
- **Business Switcher**: Easy switching between businesses
- **Per-Business Settings**: Customizable settings per business (scheduler, email, review response preferences)

### 🔐 Security & Compliance
- **Token Encryption**: AES-256-GCM encryption for sensitive credentials
- **Audit Logging**: Complete audit trail of all actions
- **Compliance Guardrails**: Automated checks for HIPAA and sensitive content
- **Session Management**: Secure cookie-based authentication
- **Automatic Token Refresh**: Seamless Google OAuth token management without manual reconnection

## 📚 Documentation

- **[DEVELOPERS_GUIDE.md](DEVELOPERS_GUIDE.md)** - Complete developer setup and architecture guide
- **[USER_GUIDE.md](USER_GUIDE.md)** - End-user documentation for all features
- **[TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)** - Common issues and solutions

## 🏗️ Technology Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Database**: SQLite (via Prisma ORM)
- **AI/ML**: OpenAI GPT-4, Ollama (Llama 3 fallback)
- **Authentication**: Google OIDC, Magic Link
- **APIs**: Google Business Profile API, Google Places API, SerpAPI, Google Ads API
- **Scheduling**: node-cron
- **Email**: Nodemailer
- **Testing**: Vitest
- **Maps**: Google Maps JavaScript API with Visualization library
- **Web Scraping**: Cheerio for HTML parsing

## 🚦 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Google Cloud Console project with APIs enabled
- OpenAI API key (or Ollama for local LLM)

### Installation

```bash
# Clone the repository
cd gmbResponseAgent

# Install dependencies
npm install

# Copy environment template
cp env.example .env

# Edit .env with your credentials (see env.example for details)
# Required: OPENAI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, etc.

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Start development server
npm run dev
```

Visit `http://localhost:3000` to access the application.

## 📖 Getting Started

1. **Read the [DEVELOPERS_GUIDE.md](DEVELOPERS_GUIDE.md)** for detailed setup instructions
2. **Configure Google OAuth** (see [GOOGLE_BUSINESS_PROFILE_SETUP.md](GOOGLE_BUSINESS_PROFILE_SETUP.md))
3. **Connect your Google Business Profile** via the Settings page
4. **Start using features** - see [USER_GUIDE.md](USER_GUIDE.md) for detailed workflows

## 🛠️ Common Tasks

### Development
```bash
npm run dev              # Start dev server with hot reload
npm run build            # Build for production
npm start                # Run production build
npm test                 # Run test suite
npm run test:watch       # Run tests in watch mode
```

### Review Management
```bash
npm run fetch-reviews    # Fetch and analyze reviews manually
npm run list-reviews     # List all reviews
npm run list-unreplied   # List unreplied reviews
```

### Posts & Content
```bash
npm run generate-smart-post    # Generate SEO post from keywords
npm run create-seo-post        # Create post with custom topic
npm run list-posts             # List all posts
```

### Keyword Research
```bash
npm run research-keywords      # Research keywords
npm run weekly-keyword-report  # Generate weekly report
npm run view-keyword-trends    # View trending keywords
```

## 🔧 Configuration

All configuration is done via environment variables in `.env`. Key settings:

- **LLM**: `OPENAI_API_KEY`, `OPENAI_MODEL` (or `OLLAMA_API_URL` for local)
- **Google OAuth**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- **Database**: `DATABASE_URL` (default: SQLite)
- **Email**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- **Scheduler**: `SCHEDULER_TZ`, cron expressions for automated tasks

See `env.example` for all available configuration options.

## 🏛️ Architecture

- **Multi-Tenant**: Data isolation by `businessId` and `locationId`
- **RBAC**: Role-based access control (Owner/Admin/Staff)
- **Service Layer**: Modular services for reviews, posts, keywords, competitive insights
- **Scheduled Jobs**: Automated tasks via node-cron
- **API-First**: RESTful APIs with Express.js

See [DEVELOPERS_GUIDE.md](DEVELOPERS_GUIDE.md) for detailed architecture documentation.

## 📝 License

Private / Proprietary

## 🤝 Support

For issues and troubleshooting, see [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md).

---

**Built with ❤️ for businesses that want to automate and scale their online presence management.**
