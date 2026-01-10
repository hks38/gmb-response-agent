# Google My Business Profile Analysis Feature

## Overview

An AI-powered analysis system that evaluates your Google My Business profile and provides actionable recommendations to boost growth, based on:
- Current profile data (reviews, posts, ratings)
- Database metrics (review sentiment, reply rates, trends)
- Current keyword trends (from weekly reports)
- Business context (services, location, website)

## Features

### 📊 Comprehensive Analysis

1. **Overall Profile Score** (0-100)
   - Rates current profile state
   - Identifies strengths and weaknesses
   - Provides benchmark for improvement

2. **Strengths & Weaknesses**
   - Highlights what's working well
   - Identifies areas needing improvement
   - Based on actual data and metrics

3. **AI-Powered Recommendations**
   - Prioritized by urgency (high/medium/low)
   - Categorized by area (SEO, Reviews, Posts, Content, Engagement)
   - Includes specific action items
   - Based on current trends and best practices

4. **Trend Analysis**
   - Analyzes current keyword trends
   - Identifies growth opportunities
   - Suggests content strategies

5. **Growth Opportunities**
   - Specific actions to drive growth
   - Based on trending keywords
   - Tailored to your business

6. **Executive Summary**
   - High-level overview
   - Key insights and priorities
   - Action plan overview

## Usage

### Command Line

```bash
npm run analyze-profile
```

This will:
1. Fetch profile data from GMB API
2. Analyze database metrics
3. Fetch current trends from weekly reports
4. Generate AI-powered analysis
5. Display comprehensive recommendations

### API Endpoint

```bash
GET /api/analysis/profile
```

Returns JSON with full analysis:
```json
{
  "overallScore": 45,
  "strengths": [...],
  "weaknesses": [...],
  "recommendations": [...],
  "trendAnalysis": "...",
  "growthOpportunities": [...],
  "aiSummary": "..."
}
```

## What Gets Analyzed

### Profile Data
- Business name, category, location
- Rating and review count
- Recent reviews (sentiment, topics)
- Recent posts (frequency, engagement)
- Business hours, contact info

### Database Metrics
- Total reviews and average rating
- Review distribution (by rating)
- Sentiment analysis results
- Reply rate and response time
- Recent review trends (last 90 days)

### Current Trends
- Top trending keywords
- Keywords trending up/down
- Market insights from weekly reports
- Keyword opportunities for content

### Business Context
- Services offered
- Location and area
- Website information
- Unique selling points

## Analysis Categories

### High Priority
- Critical issues requiring immediate action
- SEO optimization (categories, keywords)
- Review response rate
- Profile completeness

### Medium Priority
- Content strategy
- Posting frequency
- Engagement improvements
- Keyword optimization

### Low Priority
- Nice-to-have improvements
- Long-term strategies
- Advanced optimizations

## Example Output

```
🎯 Overall Profile Score: 45/100
   🔴 Poor - Immediate action needed to improve profile

✅ STRENGTHS:
1. High average rating (4.8 / 5.0)
2. Good engagement with recent reviews
3. Diverse range of dental services

⚠️  WEAKNESSES:
1. Primary category not set
2. Zero replies to reviews
3. No posts or recent activity

💡 RECOMMENDATIONS:
[High Priority]
1. Set Primary and Additional Categories
2. Increase Review Responses

[Medium Priority]
1. Enhance Post Engagement
2. Optimize Website for Keywords
```

## Integration

The analysis automatically:
- Fetches data from GMB API
- Analyzes database metrics
- Incorporates current trends
- Uses business context for relevance
- Generates AI-powered recommendations

## Benefits

1. **Data-Driven Insights**: Based on actual profile data and metrics
2. **Trend-Aware**: Incorporates current keyword trends
3. **Actionable**: Specific recommendations with action items
4. **Prioritized**: Recommendations sorted by urgency
5. **Comprehensive**: Covers all aspects of GMB optimization

## Regular Analysis

For best results, run analysis:
- **Monthly**: Track progress and improvements
- **After major changes**: See impact of updates
- **Before campaigns**: Identify opportunities
- **Quarterly**: Strategic planning

## Next Steps After Analysis

1. Review high-priority recommendations
2. Implement action items one at a time
3. Monitor results and adjust strategy
4. Re-run analysis monthly to track progress

## Troubleshooting

### API Errors
- **404 Error**: Location not found
  - Check `GOOGLE_LOCATION_ID` is correct
  - Verify location exists in your account
  
- **403 Error**: Access denied
  - Verify OAuth token has `business.manage` scope
  - Check APIs are enabled in Google Cloud Console

### Missing Data
- **No trend data**: Run `npm run weekly-keyword-report` first
- **Limited profile data**: API might not have full access
- **Database metrics**: Ensure reviews have been fetched

## Future Enhancements

- Historical comparison (track score over time)
- Competitor analysis
- Automated recommendations implementation
- Integration with admin UI for visual reports

