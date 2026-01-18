import crypto from 'crypto';

export type ComplianceTarget = 'review_reply' | 'gmb_post';

export type ComplianceViolationCode =
  | 'NeverConfirmPatient'
  | 'BannedPhraseMatch'
  | 'PossiblePHI'
  | 'HighConfidencePHI'
  | 'ProcedureMentionNotInReview';

export type ComplianceSeverity = 'low' | 'medium' | 'high';

export interface ComplianceViolation {
  code: ComplianceViolationCode;
  severity: ComplianceSeverity;
  message: string;
  meta?: Record<string, any>;
}

export interface ComplianceGuardInput {
  target: ComplianceTarget;
  text: string;
  bannedPhrases?: string[];
  // For review replies only: use the review text to avoid introducing procedures.
  reviewComment?: string | null;
  // Optional allow-listing of business contact info that is OK to include.
  allowedBusinessEmail?: string | null;
  allowedBusinessPhone?: string | null;
}

export interface ComplianceGuardResult {
  blocked: boolean;
  sanitizedText: string;
  violations: ComplianceViolation[];
}

const PRIVACY_CONTACT_SENTENCE =
  "For your privacy, we can’t discuss details here—please contact our office directly so we can help.";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const sha256Hex = (text: string): string =>
  crypto.createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');

const findBannedPhraseViolations = (text: string, bannedPhrases: string[]): ComplianceViolation[] => {
  if (!bannedPhrases || bannedPhrases.length === 0) return [];
  const lower = text.toLowerCase();
  const hits = bannedPhrases
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .filter((p) => lower.includes(p.toLowerCase()));

  return hits.map((phrase) => ({
    code: 'BannedPhraseMatch',
    severity: 'high',
    message: `Matched banned phrase: "${phrase}"`,
    meta: { phrase },
  }));
};

const findNeverConfirmPatientViolations = (text: string): ComplianceViolation[] => {
  const patterns: Array<{ re: RegExp; example: string }> = [
    { re: /\bas your (dentist|provider|doctor|hygienist)\b/i, example: 'as your dentist' },
    { re: /\b(as|being) (a )?patient of (ours|mine|this office)\b/i, example: 'patient of ours' },
    { re: /\byour (appointment|visit|treatment|procedure)\b/i, example: 'your appointment' },
    { re: /\bwe('ve| have) (been|been able to) (treating|seeing) you\b/i, example: "we've been seeing you" },
    { re: /\bthank you for choosing us for your care\b/i, example: 'choosing us for your care' },
  ];

  const violations: ComplianceViolation[] = [];
  for (const p of patterns) {
    if (p.re.test(text)) {
      violations.push({
        code: 'NeverConfirmPatient',
        severity: 'high',
        message: `Potential patient-confirmation language detected (e.g., "${p.example}").`,
      });
    }
  }
  return violations;
};

const findPhiViolations = (text: string, allowedEmail?: string | null, allowedPhone?: string | null): ComplianceViolation[] => {
  const violations: ComplianceViolation[] = [];
  const t = String(text || '');

  // High-confidence PHI/PII signals
  const highConfidence: Array<{ re: RegExp; message: string; meta?: any }> = [
    { re: /\b(DOB|date of birth)\b/i, message: 'Mentions DOB/date of birth.' },
    { re: /\bSSN\b|\bsocial security\b/i, message: 'Mentions SSN/social security.' },
    { re: /\bMRN\b|\bmedical record\b/i, message: 'Mentions medical record number (MRN).' },
  ];
  for (const h of highConfidence) {
    if (h.re.test(t)) {
      violations.push({ code: 'HighConfidencePHI', severity: 'high', message: h.message, meta: h.meta });
    }
  }

  // Dates (potential appointment dates). We treat these as possible PHI and sanitize.
  const dateLike = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g;
  if (dateLike.test(t)) {
    violations.push({
      code: 'PossiblePHI',
      severity: 'medium',
      message: 'Contains a date-like string that could reveal appointment timing.',
    });
  }

  // Email addresses (allow business email, redact others)
  const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const emails = t.match(emailRe) || [];
  const allowedEmailNorm = allowedEmail ? String(allowedEmail).trim().toLowerCase() : null;
  const disallowedEmails = emails.filter((e) => (allowedEmailNorm ? e.toLowerCase() !== allowedEmailNorm : true));
  if (disallowedEmails.length > 0) {
    violations.push({
      code: 'PossiblePHI',
      severity: 'medium',
      message: 'Contains an email address that may be personal contact info.',
      meta: { count: disallowedEmails.length },
    });
  }

  // Phone numbers (allow business phone, redact others)
  const phoneRe = /\b(?:\+?1[\s.-]?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
  const phones = t.match(phoneRe) || [];
  const allowedPhoneNorm = allowedPhone ? String(allowedPhone).replace(/\D/g, '') : null;
  const disallowedPhones = phones.filter((p) => {
    if (!allowedPhoneNorm) return true;
    return p.replace(/\D/g, '') !== allowedPhoneNorm;
  });
  if (disallowedPhones.length > 0) {
    violations.push({
      code: 'PossiblePHI',
      severity: 'medium',
      message: 'Contains a phone number that may be personal contact info.',
      meta: { count: disallowedPhones.length },
    });
  }

  return violations;
};

const PROCEDURE_KEYWORDS = [
  'implant',
  'implants',
  'invisalign',
  'veneer',
  'veneers',
  'root canal',
  'extraction',
  'wisdom teeth',
  'crown',
  'crowns',
  'filling',
  'fillings',
  'braces',
  'gum disease',
  'deep cleaning',
  'whitening',
  'teeth whitening',
];

const findProcedureMentionViolations = (replyText: string, reviewComment?: string | null): ComplianceViolation[] => {
  const comment = String(reviewComment || '').toLowerCase();
  if (!comment) return [];
  const reply = String(replyText || '').toLowerCase();

  const violations: ComplianceViolation[] = [];
  for (const kw of PROCEDURE_KEYWORDS) {
    if (reply.includes(kw) && !comment.includes(kw)) {
      violations.push({
        code: 'ProcedureMentionNotInReview',
        severity: 'medium',
        message: `Reply mentions "${kw}" which does not appear in the review comment.`,
        meta: { keyword: kw },
      });
    }
  }
  return violations;
};

const sanitizeByRemovingSentencesWith = (text: string, needles: string[]): string => {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/);
  if (sentences.length <= 1) return text;
  const needlesLower = needles.map((n) => n.toLowerCase());
  const kept = sentences.filter((s) => {
    const sl = s.toLowerCase();
    return !needlesLower.some((n) => n && sl.includes(n));
  });
  return kept.join(' ').trim();
};

const sanitizeText = (input: ComplianceGuardInput, violations: ComplianceViolation[]): ComplianceGuardResult => {
  let out = String(input.text || '');

  const bannedPhraseHits = violations
    .filter((v) => v.code === 'BannedPhraseMatch')
    .map((v) => String(v.meta?.phrase || '').trim())
    .filter(Boolean);
  for (const phrase of bannedPhraseHits) {
    out = out.replace(new RegExp(escapeRegExp(phrase), 'gi'), '[redacted]');
  }

  // Redact emails/phones (except allowed business contact)
  const allowedEmailNorm = input.allowedBusinessEmail ? String(input.allowedBusinessEmail).trim().toLowerCase() : null;
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (m) => {
    if (allowedEmailNorm && m.toLowerCase() === allowedEmailNorm) return m;
    return '[redacted]';
  });

  const allowedPhoneNorm = input.allowedBusinessPhone ? String(input.allowedBusinessPhone).replace(/\D/g, '') : null;
  out = out.replace(
    /\b(?:\+?1[\s.-]?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    (m) => {
      if (allowedPhoneNorm && m.replace(/\D/g, '') === allowedPhoneNorm) return m;
      return '[redacted]';
    }
  );

  // Redact date-like strings
  out = out.replace(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g, '[redacted]');

  // If we detected patient-confirmation language, prefer swapping in a privacy-safe sentence.
  if (violations.some((v) => v.code === 'NeverConfirmPatient')) {
    // Remove common confirmation phrases but keep the rest of the reply.
    out = out.replace(/\bas your (dentist|provider|doctor|hygienist)\b/gi, 'at our office');
    out = out.replace(/\b(as|being) (a )?patient of (ours|mine|this office)\b/gi, 'as a member of our community');
    out = out.replace(/\byour (appointment|visit|treatment|procedure)\b/gi, 'your experience');
    // Ensure privacy sentence exists
    if (!out.toLowerCase().includes("for your privacy")) {
      out = `${out.trim()}\n\n${PRIVACY_CONTACT_SENTENCE}`.trim();
    }
  }

  if (input.target === 'review_reply') {
    const procHits = violations
      .filter((v) => v.code === 'ProcedureMentionNotInReview')
      .map((v) => String(v.meta?.keyword || '').trim())
      .filter(Boolean);
    if (procHits.length > 0) {
      out = sanitizeByRemovingSentencesWith(out, procHits);
      if (!out.toLowerCase().includes("for your privacy")) {
        out = `${out.trim()}\n\n${PRIVACY_CONTACT_SENTENCE}`.trim();
      }
    }
  }

  // Block only if we saw high-confidence PHI markers (DOB/SSN/MRN).
  const blocked = violations.some((v) => v.code === 'HighConfidencePHI');

  return { blocked, sanitizedText: out.trim(), violations };
};

export const runComplianceGuard = (input: ComplianceGuardInput): ComplianceGuardResult => {
  const text = String(input.text || '');

  const violations: ComplianceViolation[] = [
    ...findNeverConfirmPatientViolations(text),
    ...findBannedPhraseViolations(text, input.bannedPhrases || []),
    ...findPhiViolations(text, input.allowedBusinessEmail, input.allowedBusinessPhone),
  ];

  if (input.target === 'review_reply') {
    violations.push(...findProcedureMentionViolations(text, input.reviewComment));
  }

  return sanitizeText(input, violations);
};


