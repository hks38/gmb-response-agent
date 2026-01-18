export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Urgency = 'low' | 'medium' | 'high';

export type ReplyVariantKey = 'A' | 'B';

export interface ReplyQualityViolation {
  code: string;
  severity: string;
  message: string;
}

export interface ReplyQualitySummary {
  ok: boolean;
  issues: string[];
  blocked: boolean;
  violations: ReplyQualityViolation[];
  sanitizedText: string;
  wordCount: number;
}

export interface ReviewReplyVariants {
  A: { text: string; qc: ReplyQualitySummary };
  B: { text: string; qc: ReplyQualitySummary };
  selected: ReplyVariantKey;
  languageCode?: string | null;
  templateId?: string | null;
  voiceProfileId?: string | null;
}

export interface ReviewAnalysis {
  sentiment: Sentiment;
  urgency: Urgency;
  topics: string[];
  suggested_actions: string[];
  risk_flags: string[];
  reply_draft: string;

  // Reply quality controls (optional)
  reply_language_code?: string | null;
  reply_variants?: ReviewReplyVariants;
}

export interface GoogleReview {
  reviewId: string;
  reviewer: { displayName?: string };
  starRating: number;
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment?: string;
    updateTime?: string;
  };
}

