# Developer's Guide - BusinessAI Suite

Complete guide for developers setting up, understanding, and contributing to BusinessAI Suite.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Project Structure](#project-structure)
4. [Architecture Overview](#architecture-overview)
5. [Development Workflow](#development-workflow)
6. [Database & Migrations](#database--migrations)
7. [Testing](#testing)
8. [API Documentation](#api-documentation)
9. [Environment Variables](#environment-variables)
10. [Common Development Tasks](#common-development-tasks)

## Prerequisites

### Required

- **Node.js 18+** and npm/yarn
- **Git** for version control
- **SQLite** (included, or use PostgreSQL for production)
- **Google Cloud Console account** with APIs enabled:
  - Google Business Profile API
  - Google Places API
  - Google OAuth 2.0
- **OpenAI API key** (or Ollama for local LLM)

### Recommended

- **TypeScript** knowledge
- **Prisma** ORM familiarity
- **Express.js** experience
- **Postman** or similar for API testing

## Initial Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd gmbResponseAgent
npm install
```

### 2. Environment Configuration

```bash
cp env.example .env
```

Edit `.env` with your credentials:

**Required:**
- `OPENAI_API_KEY` - Your OpenAI API key
- `GOOGLE_CLIENT_ID` - From Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
- `SESSION_SECRET` - Random string for session signing
- `ENCRYPTION_KEY` - 32-byte base64 key for token encryption

**Optional but recommended:**
- `GOOGLE_PLACES_API_KEY` - For competitive insights
- `SERPAPI_KEY` - For keyword ranking data
- SMTP settings for email notifications

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Or for development (creates new migration)
npx prisma migrate dev
```

### 4. Google OAuth Setup

1. **Create OAuth 2.0 Credentials** in Google Cloud Console
2. **Set Authorized Redirect URIs**:
   - `http://localhost:3000/api/auth/google/callback` (GBP OAuth)
   - `http://localhost:3000/api/auth/login/google/callback` (Login)
3. **Get Refresh Token**:
   ```bash
   npm run get-refresh-token
   ```
4. Add `GOOGLE_REFRESH_TOKEN` to `.env`

See [GOOGLE_BUSINESS_PROFILE_SETUP.md](GOOGLE_BUSINESS_PROFILE_SETUP.md) for detailed steps.

### 5. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## Project Structure

```
gmbResponseAgent/
├── src/
│   ├── server.ts                 # Express app entry point
│   ├── routes/                   # API route handlers
│   │   ├── auth.ts              # Authentication (OIDC, magic link)
│   │   ├── reviews.ts           # Review management
│   │   ├── posts.ts             # GMB post management
│   │   ├── keywords.ts          # Keyword research
│   │   ├── competitive.ts       # Competitive insights
│   │   ├── settings.ts          # Business settings
│   │   └── business.ts          # Business/team management
│   ├── services/                # Business logic layer
│   │   ├── analysisService.ts   # Review analysis with LLM
│   │   ├── reviewSync.ts        # Review fetching/syncing
│   │   ├── seoPostGenerator.ts  # Post generation
│   │   ├── googleAuth.ts        # OAuth token management
│   │   ├── competitiveInsightsService.ts
│   │   ├── keywordResearch.ts
│   │   └── ...                  # Other services
│   ├── middleware/              # Express middleware
│   │   ├── tenant.ts           # Multi-tenant context
│   │   └── rbac.ts             # Role-based access control
│   ├── jobs/                    # Scheduled jobs
│   │   └── scheduler.ts        # Cron job definitions
│   ├── db/
│   │   └── client.ts           # Prisma client singleton
│   └── utils/                   # Utility functions
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # Migration files
├── public/                     # Static frontend files
│   ├── index.html             # Main dashboard UI
│   └── login.html             # Login page
├── scripts/                    # CLI scripts
│   ├── fetchReviews.ts
│   ├── generateSmartPost.ts
│   └── ...
├── test/                       # Unit tests
│   ├── setup.ts               # Test configuration
│   └── *.test.ts              # Test files
├── package.json
├── tsconfig.json
└── .env                        # Environment variables (not in git)
```

## Architecture Overview

### Multi-Tenant Architecture

All data is scoped by `businessId` and `locationId`:

- **Business**: Top-level tenant (e.g., "Malama Dental")
- **Location**: Business location (e.g., "Main Office")
- **User**: Belongs to multiple businesses via `BusinessMembership`
- **Active Context**: User selects active business via `activeBusinessId` in session

### Data Flow

```
Request → Middleware (tenant/rbac) → Route Handler → Service → Database
```

**Example: Fetching Reviews**
1. Request hits `/api/reviews` with session cookie
2. `tenantGuard` middleware extracts `activeBusinessId` from session
3. Route handler calls `reviewSync` service
4. Service queries database with `where: { businessId, locationId }`
5. Response scoped to user's active business

### Service Layer Pattern

Services encapsulate business logic:

```typescript
// Example: src/services/reviewSync.ts
export async function syncReviewsFromGoogle(params: {
  businessId: string;
  locationIdInternal: string;
}) {
  // 1. Load Google credentials (encrypted)
  // 2. Fetch from Google API
  // 3. Deduplicate and save
  // 4. Analyze with LLM (if needed)
  // 5. Return results
}
```

### Authentication & Authorization

- **OIDC Login**: Google Sign-In for users
- **Session Cookies**: HttpOnly, Secure, SameSite
- **RBAC Middleware**: `requireRole(['OWNER', 'ADMIN'])` on routes
- **Tenant Guard**: Ensures data access scoped to active business

### LLM Integration

Unified LLM service with fallback:

```typescript
// src/services/llmService.ts
await llmService.chatCompletion({
  messages: [...],
  model: 'gpt-4o-mini',
  // Falls back to Ollama if OpenAI fails
});
```

## Development Workflow

### Running the Application

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
npm start

# With specific environment
NODE_ENV=production npm start
```

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: (if configured) Follow existing patterns
- **Naming**: camelCase for variables, PascalCase for classes/types

### Making Changes

1. **Feature Branch**: Create branch from `main`
2. **Make Changes**: Follow existing patterns
3. **Test**: Run `npm test` before committing
4. **Commit**: Descriptive commit messages
5. **PR**: Submit pull request with description

### Adding a New Feature

Example: Adding a new API endpoint

1. **Add Route** (`src/routes/`):
   ```typescript
   router.post('/new-feature', requireRole(['OWNER']), async (req, res) => {
     const tenant = requireTenant(req);
     // Implementation
   });
   ```

2. **Add Service** (`src/services/`):
   ```typescript
   export async function newFeatureService(params: {...}) {
     // Business logic
   }
   ```

3. **Add Tests** (`test/`):
   ```typescript
   describe('newFeatureService', () => {
     it('should work correctly', () => { ... });
   });
   ```

4. **Update Schema** (if needed):
   ```bash
   npx prisma migrate dev --name add_new_feature
   ```

## Database & Migrations

### Prisma Schema

Located in `prisma/schema.prisma`. Key models:

- `User` - Application users
- `Business` - Business tenants
- `Location` - Business locations
- `BusinessMembership` - User-business relationships
- `Review` - Google reviews
- `Post` - GMB posts
- `Competitor` - Competitive intelligence
- `KeywordTrend` - Keyword research data

### Creating Migrations

```bash
# 1. Edit prisma/schema.prisma
# 2. Create migration
npx prisma migrate dev --name descriptive_name

# 3. Review generated SQL in prisma/migrations/
# 4. Apply migration
npx prisma migrate deploy
```

### Resetting Database (Development Only)

```bash
npx prisma migrate reset
# ⚠️ WARNING: Deletes all data!
```

### Prisma Studio (Database GUI)

```bash
npx prisma studio
# Opens at http://localhost:5555
```

## Testing

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm test -- --coverage
```

### Test Structure

```typescript
// test/example.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, mockServices } from './setup';

describe('ServiceName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', async () => {
    // Arrange
    mockPrisma.model.findMany.mockResolvedValue([...]);
    
    // Act
    const result = await serviceFunction();
    
    // Assert
    expect(result).toEqual(...);
  });
});
```

### Test Setup

- **Vitest**: Test framework
- **Mocks**: In `test/setup.ts` for Prisma, services, etc.
- **Environment**: Uses `test/env/.env.test` to avoid loading main `.env`

## API Documentation

### Authentication Endpoints

- `GET /api/auth/login/google` - Initiate Google OIDC login
- `GET /api/auth/login/google/callback` - OIDC callback
- `POST /api/auth/magic-link/send` - Send magic link
- `GET /api/auth/magic-link/verify` - Verify magic link
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Review Endpoints

- `GET /api/reviews` - List reviews (with filters)
- `POST /api/reviews/fetch` - Fetch new reviews
- `POST /api/reviews/:id/analyze` - Analyze review
- `POST /api/reviews/:id/post-reply` - Post reply to Google
- `POST /api/reviews/bulk/approve-and-post` - Bulk actions

### Post Endpoints

- `GET /api/posts` - List posts
- `POST /api/posts` - Create post
- `DELETE /api/posts/:id` - Delete post

### Keyword Endpoints

- `GET /api/keywords/trends` - Get trending keywords
- `POST /api/keywords/research` - Research keywords
- `POST /api/keywords/weekly-report` - Generate weekly report

### Competitive Insights

- `GET /api/competitive/competitors` - List competitors
- `POST /api/competitive/discover` - Discover competitors
- `GET /api/competitive/insights` - Get insights for competitor
- `POST /api/competitive/refresh-coordinates` - Refresh competitor coordinates

### Settings

- `GET /api/settings` - Get business settings
- `PUT /api/settings` - Update settings

## Environment Variables

See `env.example` for all variables. Key ones:

### Required

- `DATABASE_URL` - Database connection string
- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `SESSION_SECRET` - Session signing secret
- `ENCRYPTION_KEY` - Token encryption key (base64, 32 bytes)

### Optional

- `OLLAMA_API_URL` - For local LLM fallback
- `GOOGLE_PLACES_API_KEY` - For competitive insights
- `SERPAPI_KEY` - For ranking data
- `SMTP_*` - Email configuration
- `SCHEDULER_TZ` - Timezone for cron jobs

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Common Development Tasks

### Adding a New Scheduled Job

1. **Add to Scheduler** (`src/jobs/scheduler.ts`):
   ```typescript
   cron.schedule('0 0 * * *', async () => {
     // Job logic
   });
   ```

2. **Add Settings** (optional, in `BusinessSettings`):
   - Enable/disable toggle
   - Cron expression
   - Email recipient

### Adding a New LLM Provider

1. **Extend `llmService.ts`**:
   ```typescript
   async chatCompletion(params) {
     if (useNewProvider) {
       return await newProvider.chat(...);
     }
     // Fallback logic
   }
   ```

### Debugging

**Enable Debug Logging:**
```bash
DEBUG=* npm run dev
```

**Check Database:**
```bash
npx prisma studio
```

**View Logs:**
- Console output for dev server
- Check `data/` directory for token files (if using file-based tokens)

### Performance Optimization

- **Database Indexing**: Add indexes in Prisma schema
- **Caching**: Use Prisma's query caching where appropriate
- **Rate Limiting**: Already implemented on API routes
- **Pagination**: Use `take` and `skip` for large datasets

### Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use PostgreSQL (not SQLite) for production
- [ ] Set secure `SESSION_SECRET`
- [ ] Generate and set `ENCRYPTION_KEY`
- [ ] Configure SMTP for emails
- [ ] Set proper `APP_BASE_URL`
- [ ] Enable HTTPS
- [ ] Set up SSL certificates
- [ ] Configure reverse proxy (nginx/Apache)
- [ ] Set up process manager (PM2/systemd)
- [ ] Enable scheduler (`DISABLE_SCHEDULER=false`)
- [ ] Set up monitoring/logging

## Troubleshooting

See [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) for common issues.

Common developer issues:

1. **Prisma Client not generated**: Run `npx prisma generate`
2. **Migration errors**: Check `prisma/migrations/` for SQL issues
3. **Type errors**: Run `npm run build` to catch TypeScript errors
4. **Token encryption errors**: Ensure `ENCRYPTION_KEY` is 32 bytes base64

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Google Business Profile API](https://developers.google.com/my-business/content/basic-setup)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

---

**Questions?** Check the main [README.md](README.md) or [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md).

