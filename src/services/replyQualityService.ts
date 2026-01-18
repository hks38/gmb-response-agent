import { runComplianceGuard } from './complianceGuard';

export interface ReplyQualityCheckResult {
  ok: boolean;
  issues: string[];
  blocked: boolean;
  violations: Array<{ code: string; severity: string; message: string }>;
  sanitizedText: string;
  wordCount: number;
}

const countWords = (text: string): number => String(text || '').split(/\s+/).filter((w) => w.trim().length > 0).length;

export const checkReplyQuality = (input: {
  text: string;
  reviewerFirstName: string;
  businessName: string;
  signature: string;
  minWords: number;
  maxWords: number;
  bannedPhrases: string[];
  reviewComment?: string | null;
  allowedBusinessEmail?: string | null;
  allowedBusinessPhone?: string | null;
}): ReplyQualityCheckResult => {
  const issues: string[] = [];
  const originalText = String(input.text || '').trim();

  // Compliance guard (also performs sanitization)
  const compliance = runComplianceGuard({
    target: 'review_reply',
    text: originalText,
    bannedPhrases: input.bannedPhrases || [],
    reviewComment: input.reviewComment,
    allowedBusinessEmail: input.allowedBusinessEmail,
    allowedBusinessPhone: input.allowedBusinessPhone,
  });

  const sanitized = compliance.sanitizedText.trim();
  const wordCount = countWords(sanitized);

  // Deterministic checks
  const greeting = `Dear ${input.reviewerFirstName},`;
  if (!sanitized.startsWith(greeting)) issues.push(`Greeting must start with "${greeting}"`);

  if (sanitized.includes('[') || sanitized.includes(']')) {
    issues.push('Reply contains bracketed placeholder(s)');
  }

  if (wordCount < input.minWords) issues.push(`Word count ${wordCount} is below minimum ${input.minWords}`);
  if (wordCount > input.maxWords) issues.push(`Word count ${wordCount} exceeds maximum ${input.maxWords}`);

  if (!sanitized.toLowerCase().includes(String(input.businessName).toLowerCase())) {
    issues.push(`Business name "${input.businessName}" not found`);
  }

  // Signature must be the final non-whitespace content (case-insensitive match)
  const sigTrim = String(input.signature || '').trim();
  if (sigTrim) {
    const endsWithSig = sanitized.toLowerCase().endsWith(sigTrim.toLowerCase());
    if (!endsWithSig) issues.push('Reply does not end with the expected signature');
  }

  // If compliance guard found high severity issues, treat as not OK
  const hasHigh = compliance.violations.some((v) => v.severity === 'high');
  if (hasHigh) issues.push('Compliance violations detected (high severity)');

  return {
    ok: issues.length === 0 && !compliance.blocked,
    issues,
    blocked: compliance.blocked,
    violations: compliance.violations.map((v) => ({
      code: v.code,
      severity: v.severity,
      message: v.message,
    })),
    sanitizedText: sanitized,
    wordCount,
  };
};


