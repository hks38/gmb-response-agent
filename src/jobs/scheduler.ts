import cron, { ScheduledTask } from 'node-cron';
import { syncReviewsFromGoogle } from '../services/reviewSync';
import { sendEmail } from '../services/emailService';
import { prisma } from '../db/client';
import { researchKeywordTrends } from '../services/keywordTrendService';
import { listLocalPosts, createLocalPost } from '../services/googlePosts';
import { generateSEOPost } from '../services/seoPostGenerator';
import { getRankingsForKeywords } from '../services/serpRankingService';
import { llmService } from '../services/llmService';
import { getBusinessSettings } from '../services/settingsService';
import { isPlacesConfigured } from '../services/googlePlaces';
import { ingestCompetitorSnapshot } from '../services/competitiveInsightsService';

let tasks: ScheduledTask[] = [];
let started = false;

const envDisabled = () => String(process.env.DISABLE_SCHEDULER || '').toLowerCase() === 'true';

const stopAll = () => {
  for (const t of tasks) {
    try {
      t.stop();
    } catch {
      // ignore
    }
  }
  tasks = [];
};

const formatReviewEmail = (reviews: any[]): string => {
  const lines: string[] = [];
  lines.push(`New/updated Google reviews were fetched and analyzed.`);
  lines.push(`Please sign in to the portal to approve and post replies.`);
  lines.push('');
  lines.push(`Reviews (${reviews.length}):`);
  lines.push('------------------------------------------------------------');
  for (const r of reviews) {
    lines.push(`- ${r.authorName} | ${r.rating}★ | ${new Date(r.createTime).toLocaleString()}`);
    if (r.comment) lines.push(`  Comment: ${r.comment}`);
    if (r.replyDraft) lines.push(`  Draft: ${r.replyDraft}`);
    lines.push(`  Status: ${r.status}`);
    lines.push('');
  }
  return lines.join('\n');
};

const pickUniqueKeyword = (keywords: string[], last5PostsText: string[]): string => {
  const hay = last5PostsText.join(' ').toLowerCase();
  const candidates = keywords.filter((k) => !hay.includes(String(k).toLowerCase()));
  return (candidates[0] || keywords[0] || 'dental care').toString();
};

export const startScheduler = () => {
  // fire-and-forget wrapper (server.ts calls this in a sync context)
  void (async () => {
    await reloadScheduler();
    started = true;
  })();
};

export const reloadScheduler = async () => {
  stopAll();

  if (envDisabled()) {
    console.log('[scheduler] Disabled (DISABLE_SCHEDULER=true)');
    return;
  }

  const enabled = await prisma.businessSettings.findMany({
    where: { schedulerEnabled: true },
    include: { business: { include: { locations: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (enabled.length === 0) {
    console.log('[scheduler] No enabled businesses (schedulerEnabled=true)');
    return;
  }

  for (const bs of enabled as any[]) {
    const businessId: string = bs.businessId;
    const settings = await getBusinessSettings(businessId);
    const TZ = settings.schedulerTz || 'America/New_York';
    const EMAIL_TO = settings.emailTo || 'malamadentalgroup@gmail.com';
    const businessName = settings.businessName || bs.business?.name || businessId;
    const businessLocation = settings.businessLocation || 'Unknown';
    const websiteUrl = settings.websiteUrl || '';
    const businessPhone = settings.businessPhone || '';

    const locations: any[] = bs.business?.locations || [];
    console.log(`[scheduler] Scheduling jobs for business=${businessId} (${businessName}). TZ=${TZ}`);

    // 1) Daily reviews per business
    tasks.push(
      cron.schedule(
        settings.dailyReviewsCron,
        async () => {
          const run = await prisma.jobRun.create({
            data: { businessId, jobType: 'daily_reviews', status: 'running', startedAt: new Date() },
          });

          const totals = { fetchedFromGoogle: 0, processed: 0, analyzed: 0, errors: 0, newOrUpdatedSaved: 0 };
          const perLocation: any[] = [];

          try {
            for (const loc of locations) {
              const googleLocationId = loc.googleLocationId || process.env.GOOGLE_LOCATION_ID;
              const googleAccountId = loc.googleAccountId || process.env.GOOGLE_ACCOUNT_ID;
              if (!googleLocationId) {
                perLocation.push({ locationId: loc.id, skipped: true, reason: 'missing_googleLocationId' });
                continue;
              }

              const r = await syncReviewsFromGoogle({
                fetchAll: false,
                businessId,
                locationIdInternal: loc.id,
                googleLocationId,
                googleAccountId,
              });
              perLocation.push({ locationId: loc.id, result: r });
              totals.fetchedFromGoogle += r.fetchedFromGoogle;
              totals.processed += r.processed;
              totals.analyzed += r.analyzed;
              totals.errors += r.errors;
              totals.newOrUpdatedSaved += r.newOrUpdatedSaved;
            }

            if (totals.newOrUpdatedSaved > 0) {
              const pending = await prisma.review.findMany({
                where: {
                  businessId,
                  repliedAt: null,
                  status: { in: ['Needs Approval', 'Auto-Approved', 'Pending Analysis'] },
                },
                orderBy: { createTime: 'desc' },
                take: Math.min(totals.newOrUpdatedSaved, 50),
              });

              await sendEmail({
                to: EMAIL_TO,
                subject: `Review approvals needed (${businessName}): ${totals.newOrUpdatedSaved} new/updated`,
                text: formatReviewEmail(pending),
              });
            }

            await prisma.jobRun.update({
              where: { id: run.id },
              data: {
                status: 'success',
                endedAt: new Date(),
                countsJson: JSON.stringify({ totals, perLocation }),
                error: null,
              },
            });
          } catch (e: any) {
            await prisma.jobRun.update({
              where: { id: run.id },
              data: {
                status: 'error',
                endedAt: new Date(),
                countsJson: JSON.stringify({ totals, perLocation }),
                error: e.message || String(e),
              },
            });
          }
        },
        { timezone: TZ }
      )
    );

    // 2) Twice weekly posts per location
    tasks.push(
      cron.schedule(
        settings.twiceWeeklyPostCron,
        async () => {
          const run = await prisma.jobRun.create({
            data: { businessId, jobType: 'twice_weekly_post', status: 'running', startedAt: new Date() },
          });

          const perLocation: any[] = [];
          try {
            for (const loc of locations) {
              const accountIdRaw = (loc.googleAccountId || process.env.GOOGLE_ACCOUNT_ID || '').replace(/^accounts\//, 'accounts/');
              const accountId = accountIdRaw.replace(/^accounts\//, '');
              const locRaw = String(loc.googleLocationId || process.env.GOOGLE_LOCATION_ID || '');
              const locationId = locRaw.startsWith('locations/') ? locRaw.split('/')[1] : locRaw;

              if (!accountId || !locationId) {
                perLocation.push({ locationId: loc.id, skipped: true, reason: 'missing_googleAccountId_or_googleLocationId' });
                continue;
              }

              const report = await researchKeywordTrends({
                accountId,
                locationId,
                radius: 10,
                businessId,
                locationIdInternal: loc.id,
              });

              const posts = await listLocalPosts({
                accountId,
                locationId,
                businessId,
                locationIdInternal: loc.id,
              });

              const lastNSummaries = (posts || [])
                .slice(0, Math.max(0, settings.avoidRepeatLastNPosts || 0))
                .map((p: any) => String(p.summary || ''))
                .filter(Boolean);

              const keywordCandidates = report.topKeywords?.map((k: any) => k.keyword).filter(Boolean) || [];
              const chosenKeyword = pickUniqueKeyword(keywordCandidates, lastNSummaries);

              const postContent = await generateSEOPost({
                topic: `Weekly dental trend: ${chosenKeyword} (${businessLocation})`,
                postType: 'STANDARD',
                callToAction: 'CALL',
                ctaUrl: undefined,
                businessId,
              });

              let summary = postContent.summary || '';
              if (businessPhone && !summary.includes(businessPhone)) {
                summary = `${summary}\n\nCall ${businessPhone}.`;
              }

              await createLocalPost({
                accountId,
                locationId,
                businessId,
                locationIdInternal: loc.id,
                post: {
                  languageCode: 'en-US',
                  summary,
                  callToAction: { actionType: 'CALL' },
                  topicType: postContent.topicType || 'STANDARD',
                },
              } as any);

              perLocation.push({ locationId: loc.id, created: true, keyword: chosenKeyword });
            }

            await prisma.jobRun.update({
              where: { id: run.id },
              data: {
                status: 'success',
                endedAt: new Date(),
                countsJson: JSON.stringify({ perLocation }),
                error: null,
              },
            });
          } catch (e: any) {
            await prisma.jobRun.update({
              where: { id: run.id },
              data: {
                status: 'error',
                endedAt: new Date(),
                countsJson: JSON.stringify({ perLocation }),
                error: e.message || String(e),
              },
            });
          }
        },
        { timezone: TZ }
      )
    );

    // 3) Monthly executive report per business
    tasks.push(
      cron.schedule(
        settings.monthlyReportCron,
        async () => {
          const run = await prisma.jobRun.create({
            data: { businessId, jobType: 'monthly_report', status: 'running', startedAt: new Date() },
          });

          try {
            const since = new Date();
            since.setMonth(since.getMonth() - 1);

            const totalReviews = await prisma.review.count({ where: { businessId } });
            const repliedReviews = await prisma.review.count({
              where: { businessId, repliedAt: { not: null } },
            });
            const repliedLastMonth = await prisma.review.count({
              where: { businessId, repliedAt: { gte: since } },
            });

            // Count posts across all locations
            let postsLastMonth = 0;
            for (const loc of locations) {
              const accountId = String(loc.googleAccountId || process.env.GOOGLE_ACCOUNT_ID || '').replace(/^accounts\//, '').trim();
              const locRaw = String(loc.googleLocationId || process.env.GOOGLE_LOCATION_ID || '');
              const locationId = locRaw.startsWith('locations/') ? locRaw.split('/')[1] : locRaw;
              if (!accountId || !locationId) continue;
              const posts = await listLocalPosts({
                accountId,
                locationId,
                businessId,
                locationIdInternal: loc.id,
              });
              postsLastMonth += (posts || []).filter((p: any) => {
                const t = p.createTime || p.updateTime;
                return t ? new Date(t) >= since : false;
              }).length;
            }

            // Rankings (SERPAPI optional)
            let rankingRows: any[] = [];
            if (settings.monthlyReportUseSerpApiRankings) {
              const latestReport = await prisma.keywordWeeklyReport.findFirst({
                where: { businessId },
                orderBy: { reportDate: 'desc' },
              });
              const topKw: string[] = latestReport?.topKeywords ? JSON.parse(latestReport.topKeywords) : [];
              const websiteDomain = String(websiteUrl)
                .replace(/^https?:\/\//i, '')
                .replace(/^www\./i, '')
                .split('/')[0];
              rankingRows = await getRankingsForKeywords({
                keywords: topKw.slice(0, 10),
                location: businessLocation,
                limit: topKw.slice(0, 10).length,
                businessName,
                websiteDomain,
              });
            }

            const reportText = [
              `Executive Report (${businessName})`,
              `Period: last 30 days`,
              ``,
              `Reviews:`,
              `- Total reviews in DB: ${totalReviews}`,
              `- Total replied: ${repliedReviews}`,
              `- Replied in last 30 days: ${repliedLastMonth}`,
              ``,
              `Posts:`,
              `- Posts created in last 30 days (GBP): ${postsLastMonth}`,
              ``,
              `SEO / GBP Rankings (top keywords):`,
              ...(rankingRows.length > 0
                ? rankingRows.map(
                    (r) =>
                      `- ${r.keyword}: GBP ${r.gmbRank ? `#${r.gmbRank}` : '—'} | Website ${r.websiteRank ? `#${r.websiteRank}` : '—'} (${r.provider})`
                  )
                : ['- (Rankings disabled or unavailable)']),
              ``,
            ].join('\n');

            // AI recommendations (optional)
            let recommendations = '';
            try {
              const completion = await llmService.generate({
                prompt:
                  `You are a marketing ops analyst. Write concise recommendations (5-8 bullets) based on this report.\n\n` +
                  reportText +
                  `\n\nReturn plain text bullets only.`,
                responseFormat: 'text',
              });
              recommendations = completion.content || '';
            } catch {
              recommendations = '- (AI recommendations unavailable)\n';
            }

            await sendEmail({
              to: EMAIL_TO,
              subject: `Monthly Executive Report: ${businessName}`,
              text: `${reportText}\nRecommendations:\n${recommendations}\n`,
            });

            await prisma.jobRun.update({
              where: { id: run.id },
              data: {
                status: 'success',
                endedAt: new Date(),
                countsJson: JSON.stringify({ totalReviews, repliedReviews, repliedLastMonth, postsLastMonth }),
                error: null,
              },
            });
          } catch (e: any) {
            await prisma.jobRun.update({
              where: { id: run.id },
              data: {
                status: 'error',
                endedAt: new Date(),
                error: e.message || String(e),
              },
            });
          }
        },
        { timezone: TZ }
      )
    );

    // 4) Hourly approval reminders / escalations
    // Sends reminders for reviews stuck in "Needs Approval" for >= 24h.
    tasks.push(
      cron.schedule(
        '10 * * * *',
        async () => {
          try {
            const now = new Date();
            const oneDayMs = 24 * 60 * 60 * 1000;

            const pending = await prisma.review.findMany({
              where: {
                businessId,
                repliedAt: null,
                status: 'Needs Approval',
              },
              include: { assignedTo: true },
              orderBy: { createTime: 'asc' },
              take: 200,
            });

            const hoursSince = (d: Date) => Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
            const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
            const EMAIL_FALLBACK = EMAIL_TO;

            // Group by recipient email to avoid spamming
            const byRecipient = new Map<string, any[]>();
            const updates: { id: number; escalationLevel: number }[] = [];

            for (const r of pending) {
              const since = (r.needsApprovalSince || r.lastAnalyzedAt || r.createTime) as Date;
              const ageHours = hoursSince(since);
              if (ageHours < 24) continue;

              if (r.lastReminderAt && now.getTime() - new Date(r.lastReminderAt).getTime() < oneDayMs) continue;

              const escalationLevel = ageHours >= 24 * 7 ? 2 : ageHours >= 72 ? 1 : 0;
              const to = (r.assignedTo?.email || EMAIL_FALLBACK || '').trim();
              if (!to) continue;

              const list = byRecipient.get(to) || [];
              list.push({ ...r, _ageHours: ageHours, _escalationLevel: escalationLevel });
              byRecipient.set(to, list);

              updates.push({ id: r.id, escalationLevel });
            }

            if (byRecipient.size === 0) return;

            for (const [to, reviews] of byRecipient.entries()) {
              const maxList = 25;
              const shown = reviews.slice(0, maxList);
              const sev = Math.max(...shown.map((r: any) => r._escalationLevel || 0));
              const subjectPrefix = sev >= 2 ? '[ESCALATION]' : '[Reminder]';
              const subject = `${subjectPrefix} Review approvals needed: ${reviews.length}`;

              const lines: string[] = [];
              lines.push(`You have Google review reply drafts waiting for approval.`);
              lines.push(`Open the portal: ${baseUrl}/portal`);
              lines.push('');
              lines.push(`Reviews (${reviews.length}${reviews.length > maxList ? `, showing first ${maxList}` : ''}):`);
              lines.push('------------------------------------------------------------');

              for (const r of shown) {
                const riskFlags = r.riskFlags
                  ? (() => {
                      try {
                        return JSON.parse(r.riskFlags);
                      } catch {
                        return [];
                      }
                    })()
                  : [];
                const risk = Array.isArray(riskFlags) && riskFlags.length ? ` | Flags: ${riskFlags.join(', ')}` : '';
                lines.push(
                  `- ${r.authorName} | ${r.rating}★ | ${new Date(r.createTime).toLocaleString()} | Age: ${r._ageHours}h${risk}`
                );
                if (r.comment) lines.push(`  Comment: ${String(r.comment).slice(0, 240)}`);
                if (r.replyDraft) lines.push(`  Draft: ${String(r.replyDraft).slice(0, 240)}`);
                lines.push('');
              }

              if (reviews.length > maxList) {
                lines.push(`(More pending reviews exist. Please open the portal for the full list.)`);
                lines.push('');
              }

              await sendEmail({ to, subject, text: lines.join('\n') });
            }

            for (const u of updates) {
              await prisma.review.update({
                where: { id: u.id },
                data: {
                  lastReminderAt: now,
                  escalationLevel: u.escalationLevel,
                },
              });
            }
          } catch (e: any) {
            console.error('[scheduler] Approval reminders failed:', e.message);
          }
        },
        { timezone: TZ }
      )
    );

    // 5) Daily competitive insights snapshot (Places API)
    // Only schedule if Places is configured to avoid noisy errors in environments without API key.
    if (isPlacesConfigured()) {
      tasks.push(
        cron.schedule(
          '20 6 * * *',
          async () => {
            try {
              const active = await prisma.competitor.findMany({
                where: { businessId, status: 'active' },
                take: 200,
              });
              if (active.length === 0) return;

              for (const c of active) {
                try {
                  await ingestCompetitorSnapshot({ businessId, competitorId: c.id });
                } catch (e: any) {
                  console.warn('[scheduler] Competitor snapshot failed:', c.id, e?.message || e);
                }
              }
            } catch (e: any) {
              console.error('[scheduler] Competitive snapshot job failed:', e.message);
            }
          },
          { timezone: TZ }
        )
      );
    }
  }
};


