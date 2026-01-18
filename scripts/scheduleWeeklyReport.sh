#!/bin/bash

# Weekly Keyword Report Scheduler
# This script runs the weekly keyword report
# Add to crontab: 0 9 * * 1 /path/to/gmbResponseAgent/scripts/scheduleWeeklyReport.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Create logs directory if it doesn't exist
mkdir -p logs

# Run the weekly report and log output
npm run weekly-keyword-report >> logs/weekly-report-$(date +%Y%m%d).log 2>&1

# Optional: Send email notification (requires mail setup)
# echo "Weekly keyword report completed. Check logs/weekly-report-$(date +%Y%m%d).log" | mail -s "Weekly Keyword Report - $(date +%Y-%m-%d)" your-email@example.com


