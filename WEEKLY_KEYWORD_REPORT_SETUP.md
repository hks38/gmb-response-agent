# Weekly Keyword Report - Setup Guide

This guide explains how to set up and run automated weekly keyword research reports for multiple locations in Morris County, NJ.

## Locations Covered

The weekly report researches keywords for the following locations (10-mile radius each):

- Long Valley, NJ
- Hackettstown, NJ
- Califon, NJ
- Tewksbury, NJ
- Flanders, NJ
- Budd Lake, NJ
- Chester, NJ
- Mendham, NJ
- Peapack and Gladstone, NJ

## Features

- **Comprehensive Research**: Analyzes 56+ dental keywords per location
- **Trend Tracking**: Compares current week with previous week and 3-month averages
- **Cross-Location Analysis**: Identifies keywords trending across multiple locations
- **AI-Generated Insights**: Provides market analysis and strategic recommendations
- **Database Storage**: All data saved for historical analysis
- **Category Breakdown**: Organizes keywords by service category (preventive, cosmetic, emergency, etc.)

## Running the Report

### Manual Run

```bash
npm run weekly-keyword-report
```

This will:
1. Research keywords for all 9 locations
2. Calculate trends and compare with historical data
3. Generate a comprehensive report with cross-location insights
4. Save individual location reports to the database
5. Save a consolidated "Morris County, NJ (All Locations)" report

### Automated Weekly Schedule

#### Option 1: Cron Job (Recommended for Linux/Mac)

1. Open your crontab:
```bash
crontab -e
```

2. Add this line to run every Monday at 9 AM:
```bash
0 9 * * 1 cd /path/to/gmbResponseAgent && /usr/local/bin/npm run weekly-keyword-report >> logs/weekly-report-$(date +\%Y\%m\%d).log 2>&1
```

**Or** use the provided shell script:
```bash
0 9 * * 1 /path/to/gmbResponseAgent/scripts/scheduleWeeklyReport.sh
```

3. Make sure Node.js path is correct:
```bash
which node
which npm
```

#### Option 2: Systemd Timer (Linux)

Create `/etc/systemd/system/weekly-keyword-report.service`:
```ini
[Unit]
Description=Weekly Keyword Report for GMB
After=network.target

[Service]
Type=oneshot
User=your-user
WorkingDirectory=/path/to/gmbResponseAgent
ExecStart=/usr/local/bin/npm run weekly-keyword-report
StandardOutput=append:/path/to/gmbResponseAgent/logs/weekly-report.log
StandardError=append:/path/to/gmbResponseAgent/logs/weekly-report-error.log
```

Create `/etc/systemd/system/weekly-keyword-report.timer`:
```ini
[Unit]
Description=Run Weekly Keyword Report Every Monday at 9 AM
Requires=weekly-keyword-report.service

[Timer]
OnCalendar=Mon *-*-* 09:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:
```bash
sudo systemctl enable weekly-keyword-report.timer
sudo systemctl start weekly-keyword-report.timer
```

#### Option 3: Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger: Weekly, Monday, 9:00 AM
4. Action: Start a program
   - Program: `npm`
   - Arguments: `run weekly-keyword-report`
   - Start in: `C:\path\to\gmbResponseAgent`

## Report Output

The report includes:

1. **Top Keywords Across All Locations**: Keywords with highest average trend scores, showing how many locations they appear in

2. **Trending Keywords**: Keywords that are trending up across multiple locations (emerging opportunities)

3. **Location-Specific Insights**: Top 3 keywords for each individual location

4. **Category Breakdown**: Distribution of keywords by service category:
   - Preventive (cleanings, checkups, exams)
   - Cosmetic (whitening, veneers, smile makeovers)
   - Restorative (crowns, implants, root canals)
   - Orthodontic (braces, Invisalign)
   - Pediatric (children's dentistry)
   - Emergency (urgent care)

5. **AI-Generated Market Insights**: Comprehensive analysis including:
   - Overall market trends
   - Regional variations
   - Emerging opportunities
   - Strategic marketing recommendations

## Viewing Reports

### View Latest Report

```bash
npm run view-keyword-trends
```

### View Report for Specific Location

```bash
npm run view-keyword-trends "Hackettstown, NJ"
```

### API Endpoint

```bash
curl http://localhost:3000/api/keywords/reports/latest
```

### Database Query

Reports are stored in `keywordWeeklyReport` table. Individual keyword trends are in `keywordTrend` table.

## Report Files

- **Console Output**: Displayed in terminal during execution
- **Database**: All reports saved to SQLite database
- **Logs**: If using cron/scheduled task, logs saved to `logs/weekly-report-YYYYMMDD.log`

## Customization

### Add/Remove Locations

Edit `scripts/weeklyKeywordReport.ts`:
```typescript
const LOCATIONS = [
  'Long Valley, NJ',
  'Hackettstown, NJ',
  // Add or remove locations here
];
```

### Change Radius

Edit `scripts/weeklyKeywordReport.ts`:
```typescript
const RADIUS = 10; // Change to desired radius in miles
```

### Custom Keywords

The system uses `generateDentalKeywords()` to create keyword lists. To customize, edit `src/services/keywordResearch.ts`.

## Troubleshooting

### "Failed to get trends" Errors

- Google Trends may have rate limits
- Wait a few minutes and retry
- The script includes delays between requests, but very large keyword sets may still hit limits

### Missing Location Coordinates

- If location coordinates aren't found via API, the script uses fallback coordinates
- Update `getLocationCoordinates()` in `scripts/weeklyKeywordReport.ts` to add more locations

### AI Summary Generation Fails

- If OpenAI quota is exceeded and Ollama isn't available, report will still generate
- Summary will use a basic template instead of AI-generated insights
- Ensure Ollama is running: `ollama serve`

## Next Steps After Report

1. **Review Top Keywords**: Identify services with highest demand across all locations
2. **Create GMB Posts**: Use trending keywords in Google Business Profile posts
3. **Content Strategy**: Create blog posts or website content around popular keywords
4. **Marketing Campaigns**: Adjust Google Ads or other marketing based on trends
5. **Competitive Analysis**: Compare trends week-over-week to identify shifts

## Example Output

```
📊 COMPREHENSIVE REPORT SUMMARY

Top 15 Keywords Across All Locations:
   1. dentist near me                           Score:  38.5 (9 locations)
   2. dental cleaning                           Score:  37.8 (9 locations)
   3. teeth whitening                           Score:  37.2 (8 locations)
   4. emergency dentist                         Score:  36.9 (7 locations)
   ...

🔥 Trending Keywords Across Multiple Locations:
   1. pediatric dentist                         Trending in: Long Valley, Hackettstown, Chester
   2. dental implants                           Trending in: Long Valley, Hackettstown, Mendham
   ...

📝 MARKET INSIGHTS:
[AI-generated comprehensive analysis]
```

## Support

For issues or questions, check:
- Logs in `logs/weekly-report-*.log`
- Database records in `keywordWeeklyReport` and `keywordTrend` tables
- Ensure environment variables are set correctly (`.env` file)

