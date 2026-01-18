import { prisma } from '../db/client';

export interface ReplyTemplateDTO {
  id: string;
  name: string;
  priority: number;
  ratingMin: number;
  ratingMax: number;
  sentiment?: string | null;
  topics?: string[];
  languageCode?: string | null;
  instructions?: string | null;
  bodyTemplate?: string | null;
  variantHints?: any;
}

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

const normalizeLang = (code?: string | null): string | null => {
  const c = String(code || '').trim();
  if (!c) return null;
  return c;
};

const baseLang = (code: string): string => {
  return code.split('-')[0] || code;
};

const langMatches = (templateCode?: string | null, actual?: string | null): boolean => {
  const t = normalizeLang(templateCode);
  if (!t) return true;
  const a = normalizeLang(actual);
  if (!a) return false;
  if (t.toLowerCase() === a.toLowerCase()) return true;
  return baseLang(t).toLowerCase() === baseLang(a).toLowerCase();
};

const topicsOverlap = (templateTopics: string[] | undefined, actualTopics: string[]): boolean => {
  if (!templateTopics || templateTopics.length === 0) return true;
  const set = new Set(actualTopics.map((t) => String(t).toLowerCase()));
  return templateTopics.some((t) => set.has(String(t).toLowerCase()));
};

export const selectReplyTemplate = async (params: {
  businessId: string;
  rating: number;
  sentiment?: string | null;
  topics: string[];
  languageCode?: string | null;
}): Promise<ReplyTemplateDTO | null> => {
  const rows = await prisma.replyTemplate.findMany({
    where: { businessId: params.businessId, enabled: true },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  const rowsSorted = rows
    .slice()
    .sort((a: any, b: any) => {
      const p = Number(b.priority || 0) - Number(a.priority || 0);
      if (p !== 0) return p;
      const ua = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const ub = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      if (ub !== ua) return ub - ua;
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return cb - ca;
    });

  for (const row of rowsSorted) {
    if (params.rating < row.ratingMin || params.rating > row.ratingMax) continue;
    if (row.sentiment && params.sentiment && String(row.sentiment) !== String(params.sentiment)) continue;
    if (row.sentiment && !params.sentiment) continue;

    const templateTopics = safeJsonParse<string[]>(row.topicsJson, []);
    if (!topicsOverlap(templateTopics, params.topics || [])) continue;
    if (!langMatches(row.languageCode, params.languageCode || null)) continue;

    return {
      id: row.id,
      name: row.name,
      priority: row.priority,
      ratingMin: row.ratingMin,
      ratingMax: row.ratingMax,
      sentiment: row.sentiment,
      topics: templateTopics,
      languageCode: row.languageCode,
      instructions: row.instructions,
      bodyTemplate: row.bodyTemplate,
      variantHints: safeJsonParse<any>(row.variantHintsJson, null),
    };
  }

  return null;
};


