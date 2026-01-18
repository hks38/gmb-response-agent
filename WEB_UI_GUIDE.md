# GMB Review Response Agent - Web UI Guide

## Overview

The comprehensive web user interface provides all features of the GMB Review Response Agent in an easy-to-use dashboard.

## Accessing the UI

1. Start the server:
   ```bash
   npm run dev
   # or
   npm start
   ```

2. Open your browser to:
   ```
   http://localhost:3000
   ```

## Features

### 1. Dashboard Overview

The dashboard shows key statistics at a glance:
- **Total Reviews**: All reviews in the database
- **Average Rating**: Current average rating
- **Reply Rate**: Percentage of reviews that have been replied to
- **Unreplied Count**: Number of reviews awaiting replies

### 2. 📝 Reviews Tab

**Features:**
- View all reviews with filtering options
- Filter by status (Needs Approval, Auto-Approved, Replied)
- Filter by rating (1-5 stars)
- Filter by sentiment (positive, neutral, negative)
- Fetch new reviews from Google Business Profile
- Auto-reply to all unreplied reviews from last 6 months

**Actions:**
- Click on any review to see full details
- View AI analysis (sentiment, urgency, topics, risk flags)
- Edit and save reply drafts
- Post replies directly to Google Business Profile

### 3. 💬 Reply to Review Tab

**Features:**
- Search for reviews by author name
- Select a review to analyze and reply
- Generate AI-powered reply drafts
- Edit reply drafts before posting
- Post replies with one click

**Workflow:**
1. Enter author name in search box
2. Click on review from results
3. Review AI analysis
4. Generate or edit reply draft
5. Post reply to GMB

### 4. 📄 GMB Posts Tab

**Features:**
- Generate SEO-optimized posts using AI
- Use weekly keyword reports for trending topics
- Create custom posts with specific topics
- Preview posts before publishing
- List all existing posts

**Post Types:**
- **Standard**: Regular informational posts
- **Event**: Event announcements
- **Offer**: Special offers or promotions
- **Alert**: Important announcements

**Call-to-Actions:**
- Learn More
- Call
- Book
- Shop
- Sign Up

### 5. 📊 Keyword Trends Tab

**Features:**
- Research keywords for any location
- Generate weekly keyword reports
- View saved trend data
- See top keywords and trending topics

**Research Keywords:**
1. Enter location (e.g., "Long Valley, NJ")
2. Set radius in miles (default: 10)
3. Click "Research Keywords"
4. View top keywords with volume and trend data

**Weekly Reports:**
- Generate comprehensive weekly reports for all configured locations
- View trend summaries
- See top keywords and trending topics
- Use trends to create SEO-optimized posts

### 6. 🔍 Profile Analyzer Tab

**Features:**
- Comprehensive GMB profile analysis
- AI-powered growth recommendations
- Strengths and weaknesses identification
- Prioritized action items (High, Medium, Low priority)
- Trend analysis integration
- Growth opportunities

**Analysis Includes:**
- Overall profile score (0-100)
- Review performance metrics
- Post engagement analysis
- Keyword trend leverage
- Actionable recommendations

## API Endpoints

All features are accessible via REST API:

### Reviews
- `GET /api/reviews` - List all reviews (with filters)
- `GET /api/reviews/:id` - Get specific review
- `POST /api/reviews/fetch` - Fetch new reviews
- `POST /api/reviews/:id/analyze` - Re-analyze review
- `PATCH /api/reviews/:id/reply` - Update reply draft
- `POST /api/reviews/:id/post-reply` - Post reply to GMB
- `POST /api/reviews/auto-reply-unreplied` - Auto-reply to unreplied

### Posts
- `GET /api/posts` - List all posts
- `POST /api/posts/generate` - Generate post (preview)
- `POST /api/posts/create` - Create and post to GMB

### Keywords
- `POST /api/keywords/research` - Research keywords for location
- `POST /api/keywords/weekly-report` - Generate weekly report
- `GET /api/keywords/trends` - Get latest trends

### Analysis
- `GET /api/analysis/profile` - Analyze GMB profile

## Keyboard Shortcuts

- `Ctrl/Cmd + R` - Refresh current view
- `Esc` - Close modals/dialogs

## Tips & Best Practices

1. **Regular Reviews Check**: Use "Fetch New Reviews" daily to stay updated
2. **Auto-Reply**: Review auto-approved replies before posting (especially for 4-5 star reviews)
3. **Weekly Reports**: Generate keyword reports weekly to stay on top of trends
4. **Post Timing**: Post to GMB 2-3 times per week for optimal engagement
5. **Profile Analysis**: Run profile analysis monthly to track growth

## Troubleshooting

### Reviews not loading
- Check that `GOOGLE_ACCOUNT_ID` and `GOOGLE_LOCATION_ID` are set in `.env`
- Verify OAuth token has proper permissions
- Ensure Google Business Profile API is enabled

### Posts failing to create
- Verify post content is under 1500 characters
- Check that `CALL` action type doesn't include URL
- Ensure media URLs are publicly accessible

### Keyword research not working
- Google Trends API may have rate limits
- Try reducing the number of keywords
- Use weekly report script for comprehensive analysis

### Analysis not generating
- Ensure database has review data
- Check that OpenAI API key is set
- Verify business configuration in `.env`

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review API error messages in browser console
3. Check server logs for detailed error information


