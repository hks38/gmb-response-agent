import { generateEnhancedContent } from './enhancedContentGenerator';
import { sha256Hex } from './complianceGuard';
import type { ReplyTemplateDTO } from './replyTemplateService';
import type { ReplyVoiceProfileDTO } from './replyVoiceService';
import { checkReplyQuality, ReplyQualityCheckResult } from './replyQualityService';
import { normalizeReviewReplyText } from './replyNormalizeService';

export type ReplyVariantKey = 'A' | 'B';

export interface ReplyVariantsPayload {
  A: { text: string; qc: ReplyQualityCheckResult };
  B: { text: string; qc: ReplyQualityCheckResult };
  selected: ReplyVariantKey;
  languageCode?: string | null;
  templateId?: string | null;
  voiceProfileId?: string | null;
}

const uniq = (items: string[]): string[] => Array.from(new Set(items.map((s) => String(s).trim()).filter(Boolean)));

export const deterministicVariant = (stableId?: string | null): ReplyVariantKey => {
  const id = String(stableId || '').trim();
  if (!id) return 'A';
  const hex = sha256Hex(id);
  const last = hex[hex.length - 1] || '0';
  const n = parseInt(last, 16);
  return Number.isFinite(n) && n % 2 === 0 ? 'A' : 'B';
};

const renderTemplate = (tpl: string, vars: Record<string, string>): string => {
  let out = String(tpl || '');
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v ?? ''));
  }
  return out;
};

export const pickSignatureTemplate = (params: {
  defaultSignature: string;
  signatureVariantsJson?: string | null;
  languageCode?: string | null;
  isNegative: boolean;
}): string => {
  const raw = String(params.signatureVariantsJson || '').trim();
  if (!raw) return params.defaultSignature;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return params.defaultSignature;
  }

  const group = params.isNegative ? parsed?.negative : parsed?.default;
  if (!group || typeof group !== 'object') return params.defaultSignature;

  const lc = String(params.languageCode || '').trim();
  const base = lc ? lc.split('-')[0] : '';

  const cand =
    (lc && group[lc]) ||
    (base && group[base]) ||
    group.en ||
    group['en-US'] ||
    null;

  return String(cand || params.defaultSignature);
};

export const generateReplyVariants = async (params: {
  stableReviewId?: string | null;
  reviewerFirstName: string;
  rating: number;
  comment?: string | null;
  sentiment?: string | null;
  urgency?: string | null;
  topics: string[];
  keywords: string[];
  maxWords: number;
  minWords: number;
  businessName: string;
  businessLocation: string;
  businessPhone?: string | null;
  businessEmail?: string | null;
  languageCode?: string | null;
  defaultSignature: string;
  signatureVariantsJson?: string | null;
  voice: ReplyVoiceProfileDTO;
  template?: ReplyTemplateDTO | null;
  bannedPhrasesFromSettings: string[];
}): Promise<ReplyVariantsPayload> => {
  const isNegative = params.rating <= 3 || String(params.sentiment || '').toLowerCase() === 'negative';
  const signatureTemplate = pickSignatureTemplate({
    defaultSignature: params.defaultSignature,
    signatureVariantsJson: params.signatureVariantsJson || null,
    languageCode: params.languageCode || null,
    isNegative,
  });

  const signature = renderTemplate(signatureTemplate, {
    businessName: params.businessName,
    businessPhone: params.businessPhone ? String(params.businessPhone) : '',
    businessEmail: params.businessEmail ? String(params.businessEmail) : '',
  }).trim();

  const baseRules = `
Business Name: ${params.businessName}
Location: ${params.businessLocation}
Language: ${params.languageCode || 'auto'} (write the reply in this language)
Reviewer First Name: ${params.reviewerFirstName} (use ONLY the first name in greeting)

Review Details:
- Rating: ${params.rating}/5
- Comment: ${params.comment || '(no comment)'}
- Sentiment: ${params.sentiment || 'unknown'}
- Urgency: ${params.urgency || 'unknown'}
- Topics: ${params.topics.join(', ') || '(none)'}

Rules:
- Start with "Dear ${params.reviewerFirstName},"
- End with exactly: "${signature}" (must match exactly)
- NEVER use placeholders like [Reviewer's Name], [Your Name], [Name], or any bracketed placeholders
- Word count: MINIMUM ${params.minWords} words, MAXIMUM ${params.maxWords} words (MUST follow)
- Never confirm someone is a patient
- Never mention procedures unless reviewer did
- No personal health info
- If rating <= 3 or sentiment negative, invite contact and do not argue
`.trim();

  const voiceBlock = `
Voice Profile: ${params.voice?.name || 'Default'}
Tone: ${params.voice?.tone || 'warm, friendly, professional'}
Style: ${params.voice?.style || 'concise and professional'}
Do:
${(params.voice?.doList || []).map((s) => `- ${s}`).join('\n') || '- (none)'}
Don't:
${(params.voice?.dontList || []).map((s) => `- ${s}`).join('\n') || '- (none)'}
Preferred phrases:
${(params.voice?.examplePhrases || []).map((s) => `- ${s}`).join('\n') || '- (none)'}
`.trim();

  const templateBlock = params.template
    ? `
Template: ${params.template.name}
Template instructions:
${params.template.instructions || '(none)'}

Template scaffold (optional):
${params.template.bodyTemplate || '(none)'}
`.trim()
    : '';

  const variantHints = params.template?.variantHints || null;
  const hintA =
    variantHints?.A ||
    'Variant A: slightly more concise and straightforward.';
  const hintB =
    variantHints?.B ||
    'Variant B: slightly more empathetic with one extra sentence of reassurance.';

  const fullKeywords = uniq(params.keywords || []);
  const selected = deterministicVariant(params.stableReviewId);
  const bannedPhrases = uniq([...(params.bannedPhrasesFromSettings || []), ...(params.voice?.bannedPhrases || [])]);

  const make = async (key: ReplyVariantKey, hint: string) => {
    const result = await generateEnhancedContent({
      task: 'review_reply',
      keywords: fullKeywords,
      topic: `Reply to ${params.rating}-star review${params.comment ? `: "${String(params.comment).substring(0, 80)}..."` : ''}`,
      maxWords: params.maxWords,
      minWords: params.minWords,
      tone: params.voice?.tone || 'warm, friendly, professional',
      style: params.voice?.style || 'concise and professional',
      additionalContext: [baseRules, voiceBlock, templateBlock, hint].filter(Boolean).join('\n\n'),
    });

    const normalized = normalizeReviewReplyText({
      text: result.content,
      reviewerFirstName: params.reviewerFirstName,
      signature,
    });

    const qc = checkReplyQuality({
      text: normalized,
      reviewerFirstName: params.reviewerFirstName,
      businessName: params.businessName,
      signature,
      minWords: params.minWords,
      maxWords: params.maxWords,
      bannedPhrases,
      reviewComment: params.comment,
      allowedBusinessEmail: params.businessEmail || null,
      allowedBusinessPhone: params.businessPhone || null,
    });

    return { text: qc.sanitizedText, qc };
  };

  const A = await make('A', hintA);
  const B = await make('B', hintB);

  return {
    A,
    B,
    selected,
    languageCode: params.languageCode || null,
    templateId: params.template?.id || null,
    voiceProfileId: params.voice?.id || null,
  };
};


