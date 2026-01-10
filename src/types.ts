export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Urgency = 'low' | 'medium' | 'high';

export interface ReviewAnalysis {
  sentiment: Sentiment;
  urgency: Urgency;
  topics: string[];
  suggested_actions: string[];
  risk_flags: string[];
  reply_draft: string;
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

