# User Guide - BusinessAI Suite

Complete guide for end users on how to use BusinessAI Suite to manage reviews, posts, keywords, and competitive intelligence.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Review Management](#review-management)
4. [Google Business Profile Posts](#google-business-profile-posts)
5. [Keyword Research & Trends](#keyword-research--trends)
6. [Competitive Insights](#competitive-insights)
7. [Team Management](#team-management)
8. [Settings](#settings)
9. [Automated Features](#automated-features)

## Getting Started

### First-Time Login

1. **Visit the Application**: Navigate to your BusinessAI Suite URL
2. **Sign In with Google**: Click "Continue with Google" or use magic link
3. **Select/Create Business**: Choose your business or create a new one
4. **Connect Google Business Profile**: Go to Settings → Google Business Profile → Connect

### Initial Setup

1. **Configure Business Settings**:
   - Business name, location, phone
   - Review response signature
   - Word limits for responses
   - Email notification settings

2. **Connect Google Business Profile**:
   - Click "Connect Google Business Profile" in Settings
   - Authorize access to your Google account
   - Select the location to connect

3. **Set Up Team** (if applicable):
   - Invite team members
   - Assign roles (Owner/Admin/Staff)

## Dashboard Overview

The dashboard provides a central hub for all features:

- **Reviews Tab**: Manage and respond to reviews
- **Posts Tab**: Create and manage GMB posts
- **Trends Tab**: Keyword research and trends
- **Competitive Tab**: Competitor analysis and insights
- **Team Tab**: Manage team members
- **Settings Tab**: Configure preferences

### Header Navigation

- **Business Switcher**: Switch between multiple businesses (🏢 icon)
- **Profile Menu**: Access Settings and Logout

## Review Management

### Viewing Reviews

1. **Navigate to Reviews Tab**
2. **Use Filters**:
   - Status: All, Needs Approval, Auto-Approved, Posted
   - Rating: Filter by star rating
   - Sentiment: Positive, Neutral, Negative
   - Search: Search by review text

### Fetching New Reviews

1. Click **"Fetch New Reviews"** button
2. System automatically:
   - Fetches latest reviews from Google
   - Analyzes each review with AI
   - Generates reply drafts
   - Flags reviews needing approval

### Review Analysis

Each review shows:

- **AI Analysis**: Sentiment, urgency, topics, suggested actions
- **Risk Flags**: HIPAA concerns, compliance issues
- **Suggested Reply**: AI-generated response draft
- **Status**: Needs Approval or Auto-Approved

### Responding to Reviews

**Single Review:**

1. Review the AI-generated response
2. Edit if needed
3. Click **"Approve & Post Reply"** or **"Copy to Clipboard"**

**Bulk Actions:**

1. Select multiple reviews using checkboxes
2. Click **"Bulk Approve & Post"**
3. Confirm action
4. Reviews are posted sequentially with rate limiting

### Review Status

- **Needs Approval**: Negative reviews, HIPAA risks, or rating ≤ 3
- **Auto-Approved**: Positive reviews without risks (but still require manual posting)
- **Posted**: Successfully posted to Google Business Profile

## Google Business Profile Posts

### Creating Posts

1. **Navigate to Posts Tab**
2. **Click "Create Post"**
3. **Fill in Details**:
   - Title/Headline
   - Content (or use AI generator)
   - Post Type: STANDARD, EVENT, OFFER, ALERT
   - Call-to-Action: Book, Order, Shop, Learn More, etc.
   - Media (optional): Upload image

### AI-Powered Post Generation

**Using Keyword Trends:**

1. Go to **Trends Tab** → Generate weekly report
2. Go to **Posts Tab** → Click "Generate Smart Post"
3. System uses trending keywords to create SEO-optimized content

**Manual Generation:**

1. Click **"Generate Post"** or use command line:
   ```bash
   npm run generate-smart-post "Your topic here"
   ```

### Post Types

- **STANDARD**: Regular informational posts
- **EVENT**: Announcements for events
- **OFFER**: Promotional offers
- **ALERT**: Important notices

### Managing Posts

- **View**: See all posts in the Posts tab
- **Edit**: Click on a post to edit
- **Delete**: Remove posts (if needed)
- **Publish**: Posts are automatically published to Google Business Profile

## Keyword Research & Trends

### Keyword Research

1. **Navigate to Trends Tab**
2. **Enter Parameters**:
   - Location (city, state, or region)
   - Category/Topic
   - Number of keywords
   - Toggle: "Include GBP + website rankings" (uses SerpAPI credits)

3. **Click "Research Keywords"**

### Results Display

- **Keyword List**: Trending keywords with metrics
- **GBP Ranking**: Your position in Google Maps/local pack
- **Website Ranking**: Your organic search position
- **Competitor Comparison**: See how competitors rank

### Weekly Keyword Reports

1. **Generate Report**: Click "Generate Weekly Report"
2. **View Trends**: See trending keywords over time
3. **Use for Posts**: Generate posts based on trending keywords

### Export Options

- Copy keywords to clipboard
- Use for content planning
- Share with team

## Competitive Insights

### Discovering Competitors

1. **Navigate to Competitive Tab**
2. **Enter Discovery Parameters**:
   - Query: e.g., "dentist near me"
   - Radius: Search radius in miles (default: 10)
   - Limit: Number of competitors (max 20)

3. **Click "Discover"**

### Map View

- **Interactive Map**: Shows all competitors with location markers
- **Radius Circle**: Visual representation of search radius
- **Info Windows**: Click markers to see competitor details

### Competitor Insights

**View Insights:**

1. Click **"View insights"** on any competitor
2. See detailed analysis:
   - Review trends and ratings
   - Keyword overlap
   - Website analysis (SEO score, content quality)
   - Competitive positioning

**Create Snapshot:**

- Snapshots capture competitor state at a point in time
- Compare changes over time
- Track competitor growth/decline

### Competitor Management

- **Lock**: Prevent automatic updates
- **Hide**: Hide from view (doesn't delete)
- **Delete**: Remove competitor completely

## Team Management

### Inviting Team Members

1. **Navigate to Team Tab**
2. **Enter Email** of team member
3. **Select Role**:
   - **Owner**: Full access, manage team
   - **Admin**: Manage reviews, posts, settings
   - **Staff**: View and manage reviews only

4. **Click "Invite Member"**

### Managing Members

- **View**: See all team members and their roles
- **Change Role**: Update permissions
- **Remove**: Remove team member from business

### Roles & Permissions

**Owner:**
- Full access to all features
- Manage team members
- Change business settings
- Connect/disconnect Google Business Profile

**Admin:**
- Manage reviews and posts
- Access competitive insights
- Generate reports
- Cannot manage team or connect GBP

**Staff:**
- View and respond to reviews
- Limited post creation
- Cannot access settings or competitive insights

## Settings

### Business Information

- **Business Name**: Used in posts and responses
- **Location**: City/State for localization
- **Phone**: Phone number for CTAs
- **Website**: Your website URL

### Review Response Settings

- **Min/Max Words**: Control response length
- **Signature**: Default signature for replies
- **Language**: Default response language
- **Banned Phrases**: Phrases to avoid in responses

### Post Settings

- **Max Words**: Maximum word count for posts
- **Default CTA**: Default call-to-action button

### Scheduler Settings

Configure automated tasks:

- **Enable/Disable Scheduler**: Toggle automation
- **Timezone**: Set timezone for scheduled tasks
- **Daily Reviews**: Fetch and analyze reviews daily
- **Weekly Posts**: Generate posts twice weekly
- **Monthly Reports**: Generate executive reports

### Google Business Profile

- **Connection Status**: See if GBP is connected
- **Connect**: Authorize and connect your GBP account
- **Disconnect**: Remove connection (doesn't delete data)

### Email Notifications

- **SMTP Settings**: Configure email server
- **Recipient Email**: Where to send notifications
- **Notification Types**: Choose what to get notified about

## Automated Features

### Daily Review Sync

**When**: Runs daily at 7:00 PM ET (configurable)

**What it does:**
- Fetches new/updated reviews from Google
- Analyzes reviews with AI
- Generates reply drafts
- Sends email notification if new reviews found

**Email includes:**
- Number of new reviews
- Review summaries
- Link to approve/publish responses

### Twice-Weekly Post Generation

**When**: Runs twice weekly (default: Tuesday & Friday at 10:00 AM ET)

**What it does:**
- Researches trending keywords (without SerpAPI)
- Generates unique post topics (avoids last 5 posts)
- Creates SEO-optimized post with phone number CTA
- Publishes to Google Business Profile

### Monthly Executive Report

**When**: Runs monthly on the 1st at 9:00 AM ET

**What it includes:**
- Review statistics (count, average rating, reply rate)
- Post generation summary
- Keyword rankings (if enabled)
- AI-powered recommendations
- Growth opportunities

**Delivered via**: Email to configured recipient

### Configuration

All automated features can be:
- Enabled/disabled in Settings
- Scheduled via cron expressions
- Configured with timezone settings

## Tips & Best Practices

### Review Responses

1. **Personalize**: Edit AI-generated responses to add personal touch
2. **Respond Promptly**: Use daily sync to catch reviews early
3. **Handle Negative Reviews**: Address concerns specifically
4. **Thank Positive Reviews**: Show appreciation for happy customers

### Posts

1. **Use Trends**: Generate posts based on trending keywords
2. **Mix Post Types**: Variety keeps your profile engaging
3. **Include CTAs**: Always include call-to-action buttons
4. **Post Regularly**: Use automated posting for consistency

### Competitive Intelligence

1. **Regular Snapshots**: Refresh competitor data monthly
2. **Monitor Trends**: Track competitor review velocity
3. **Keyword Overlap**: Identify ranking opportunities
4. **Website Analysis**: Learn from competitor strengths

### Team Collaboration

1. **Define Roles**: Use appropriate permissions for team members
2. **Review Workflows**: Establish approval processes
3. **Monitor Activity**: Use audit logs to track changes

## Troubleshooting

### Common Issues

**Reviews not fetching:**
- Check Google Business Profile connection
- Verify API credentials in Settings
- Check rate limiting (Google API limits)

**Posts not publishing:**
- Verify GBP connection
- Check post content for errors
- Ensure proper permissions

**Email notifications not working:**
- Verify SMTP settings
- Check spam folder
- Test email configuration

For detailed troubleshooting, see [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md).

## Keyboard Shortcuts

- **Ctrl/Cmd + K**: Quick search (if implemented)
- **Ctrl/Cmd + S**: Save draft
- **Esc**: Close modals

## Getting Help

- **Documentation**: Check this guide and README
- **Troubleshooting**: See TROUBLESHOOTING_GUIDE.md
- **Support**: Contact your administrator

---

**Happy managing your online presence with BusinessAI Suite! 🚀**

