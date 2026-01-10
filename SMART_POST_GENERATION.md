# Smart Post Generation - Automated GMB Posts from Keyword Trends

The Smart Post Generator automatically creates Google Business Profile posts based on your weekly keyword research reports, ensuring your content aligns with what people are actually searching for in your area.

## How It Works

```
┌─────────────────────────────────┐
│  Weekly Keyword Report          │
│  (Runs every Monday)            │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Smart Post Generator           │
│  • Checks for latest report     │
│  • Extracts trending keywords   │
│  • Generates SEO-optimized posts│
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Google Business Profile        │
│  (Published posts)              │
└─────────────────────────────────┘
```

## Features

- ✅ **Automatic Keyword Selection**: Uses trending keywords from weekly reports
- ✅ **Intelligent Fallback**: Uses custom topic if no report exists
- ✅ **Multiple Posts**: Can generate multiple posts (one per keyword)
- ✅ **SEO Optimized**: Natural keyword inclusion, location-aware
- ✅ **AI-Generated Content**: Creates engaging, relevant posts

## Usage Examples

### Basic Usage

```bash
# Generate one post using weekly report keywords (if available)
npm run generate-smart-post
```

This will:
1. Look for the latest weekly keyword report
2. If found: Use top trending keyword to generate post
3. If not found: Use default topic "General dental care"

### With Custom Fallback Topic

```bash
# If no report exists, use this topic instead
npm run generate-smart-post "Teeth whitening special offer"
```

### Generate Multiple Posts

```bash
# Generate 3 posts from weekly report (uses top 3 trending keywords)
npm run generate-smart-post "" STANDARD LEARN_MORE true 3
```

Parameters:
- `""` - Empty topic (will use report if available)
- `STANDARD` - Post type
- `LEARN_MORE` - Call-to-action
- `true` - Use weekly report (default)
- `3` - Maximum posts to generate

### Force Custom Topic (Ignore Report)

```bash
# Always use custom topic, ignore weekly report
npm run generate-smart-post "New patient special" STANDARD BOOK false
```

### Different Post Types

```bash
# Offer post
npm run generate-smart-post "" OFFER SHOP

# Event post
npm run generate-smart-post "" EVENT LEARN_MORE

# Alert post
npm run generate-smart-post "" ALERT CALL
```

## Weekly Workflow

### Recommended Schedule

**Monday Morning:**
```bash
# Generate weekly keyword report for all locations
npm run weekly-keyword-report
```

**Monday-Wednesday:**
```bash
# Generate 2-3 posts using trending keywords
npm run generate-smart-post "" STANDARD LEARN_MORE true 3
```

**Thursday-Friday:**
```bash
# Generate additional posts as needed
npm run generate-smart-post
```

**Or automate it:**
```bash
# Add to crontab to run automatically
0 10 * * 1 cd /path/to/gmbResponseAgent && npm run weekly-keyword-report
0 11 * * 1 cd /path/to/gmbResponseAgent && npm run generate-smart-post "" STANDARD LEARN_MORE true 3
```

## Keyword Selection Logic

The smart post generator uses the following priority:

1. **Trending Keywords** (from `trendingUp` field in report)
   - Keywords showing growth across multiple locations
   - Gets up to 50% of posts

2. **Top Keywords** (from `topKeywords` field in report)
   - Highest search volume keywords
   - Fills remaining slots

3. **Fallback** (if no report)
   - Uses custom topic or default

## Example Output

```
🎯 Smart GMB Post Generator

   Mode: Using weekly report (if available)
   Post Type: STANDARD
   Call-to-Action: LEARN_MORE
   Max Posts: 3

📊 Using weekly keyword report from 2026-01-05
🎯 Generating 3 post(s) using keywords: pediatric dentist, cosmetic dentist, dental implants

📄 Post 1/3
   Keyword: pediatric dentist
   Summary: Looking for gentle pediatric dental care for your child? At Family Dentistry...
   ✅ Posted successfully!

📄 Post 2/3
   Keyword: cosmetic dentist
   Summary: Ready to transform your smile? Our cosmetic dentistry services...
   ✅ Posted successfully!

📄 Post 3/3
   Keyword: dental implants
   Summary: Missing a tooth? Dental implants offer a permanent solution...
   ✅ Posted successfully!

💡 Post generated from weekly keyword trends!
```

## Topic Generation

Keywords are automatically converted to natural topics:

- `pediatric dentist` → "Pediatric dental care for children"
- `teeth whitening` → "Professional teeth whitening treatments"
- `emergency dentist` → "Emergency dental care when you need it most"
- `dental implants` → "Dental implants for permanent tooth replacement"

See `src/services/smartPostGenerator.ts` for the full mapping.

## Troubleshooting

### "No weekly report found"

**Solution**: Run the weekly keyword report first:
```bash
npm run weekly-keyword-report
```

### Posts not using trending keywords

**Check**: Verify the report exists and has data:
```bash
npm run view-keyword-trends
```

### Want to use different keywords

**Option 1**: Generate a new weekly report with fresh data
**Option 2**: Use custom topic instead:
```bash
npm run generate-smart-post "Your custom topic" STANDARD LEARN_MORE false
```

## Best Practices

1. **Run Weekly Reports First**: Always run `weekly-keyword-report` before generating posts
2. **Space Out Posts**: Generate 2-3 posts per week, not all at once
3. **Mix Post Types**: Use STANDARD, OFFER, and EVENT posts for variety
4. **Monitor Performance**: Check which keywords drive engagement
5. **Adjust Based on Trends**: If certain keywords consistently appear, focus on those

## Integration with Weekly Reports

The smart post generator integrates seamlessly with the weekly keyword report:

- Automatically finds the latest report (consolidated or location-specific)
- Extracts trending keywords and top-performing keywords
- Generates contextually relevant posts
- Tracks which keywords have been used

This ensures your GMB posts stay aligned with what people are actually searching for in your area!

