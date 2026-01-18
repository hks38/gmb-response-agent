import { reviewPrompt } from '../prompts/reviewPrompt';
import { ReviewAnalysis } from '../types';
import { getWebsiteContext } from './websiteContext';
import { llmService } from './llmService';
import { getBusinessConfig } from './businessConfig';
import { getBusinessSettings } from './settingsService';
import { getDefaultBusinessId } from './tenantDefaults';
import { getActiveVoiceProfile } from './replyVoiceService';
import { selectReplyTemplate } from './replyTemplateService';
import { generateReplyVariants } from './replyVariantService';

const LOCAL_SEO_PHRASES = [
  'Long Valley dentist',
  'family dentist Long Valley',
  'gentle dental care',
  'Long Valley dental practice',
];

export const analyzeReview = async (params: {
  authorName: string;
  rating: number;
  comment?: string | null;
  createTime: string;
  businessId?: string;
  reviewId?: string | null;
}): Promise<ReviewAnalysis> => {
  // Fetch website context (cached for 24 hours)
  const practiceInfo = await getWebsiteContext();

  const businessId = params.businessId || (await getDefaultBusinessId());
  // Get business config + settings for context
  const businessConfig = await getBusinessConfig(businessId);
  const settings = await getBusinessSettings(businessId);

  // First, get analysis (sentiment, urgency, topics, etc.)
  const analysisPrompt = reviewPrompt({
    authorName: params.authorName,
    rating: params.rating,
    comment: params.comment,
    createTime: params.createTime,
    practiceInfo,
    businessName: businessConfig.name,
    businessLocation: businessConfig.location,
  });

  const completion = await llmService.generate({
    prompt: analysisPrompt,
    responseFormat: 'json',
  });

  const text = completion.content || '';
  console.log(`✓ Analysis generated using ${completion.provider} (${completion.model})`);

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse model response: ${text}`);
  }

  // Extract keywords from topics and review
  const keywords: string[] = [];
  
  // Add topics as keywords
  if (parsed.topics && Array.isArray(parsed.topics)) {
    keywords.push(...parsed.topics);
  }
  
  // Add one local SEO phrase
  keywords.push(LOCAL_SEO_PHRASES[Math.floor(Math.random() * LOCAL_SEO_PHRASES.length)]);
  
  // Determine reviewer name - use actual name if available, otherwise "Valued Patient"
  const fullReviewerName = params.authorName && 
                            params.authorName.trim() && 
                            params.authorName !== 'Guest' && 
                            params.authorName !== 'Unknown' &&
                            params.authorName !== 'Anonymous'
    ? params.authorName.trim()
    : 'Valued Patient';
  
  // Extract first name only (for greeting)
  // If it's "Valued Patient", use as-is. Otherwise, take the first word.
  const reviewerFirstName = fullReviewerName === 'Valued Patient' 
    ? 'Valued Patient'
    : fullReviewerName.split(/\s+/)[0].trim();
  
  const languageCode = String(parsed.languageCode || parsed.language_code || 'en').trim() || 'en';

  // Load voice + template
  const voice = await getActiveVoiceProfile(businessId);
  const template = await selectReplyTemplate({
    businessId,
    rating: params.rating,
    sentiment: parsed.sentiment || null,
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    languageCode,
  });

  const reply_variants = await generateReplyVariants({
    stableReviewId: params.reviewId || null,
    reviewerFirstName,
    rating: params.rating,
    comment: params.comment,
    sentiment: parsed.sentiment,
    urgency: parsed.urgency,
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    keywords,
    maxWords: settings.reviewMaxWords,
    minWords: settings.reviewMinWords,
    businessName: businessConfig.name,
    businessLocation: businessConfig.location,
    businessPhone: settings.businessPhone || null,
    businessEmail: settings.businessEmail || null,
    languageCode,
    defaultSignature: settings.reviewSignature,
    signatureVariantsJson: settings.reviewSignatureVariantsJson || null,
    voice,
    template,
    bannedPhrasesFromSettings: settings.bannedPhrases || [],
  });

  const selectedVariant = reply_variants.selected;
  const selectedText = reply_variants[selectedVariant].text;

  const risk_flags: string[] = Array.isArray(parsed.risk_flags) ? parsed.risk_flags.slice() : [];
  const selectedQc = reply_variants[selectedVariant].qc;
  if (!selectedQc.ok || selectedQc.blocked) {
    risk_flags.push('QC failed');
  }

    return {
      sentiment: parsed.sentiment,
      urgency: parsed.urgency,
      topics: parsed.topics || [],
      suggested_actions: parsed.suggested_actions || [],
    risk_flags,
    reply_draft: selectedText,
    reply_language_code: languageCode,
    reply_variants,
    };
};

