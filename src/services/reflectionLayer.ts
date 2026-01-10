import { llmService } from './llmService';

export interface ContentToVerify {
  content: string;
  task: 'blog_post' | 'review_reply' | 'seo_post';
  keywords: string[];
  maxWords: number;
  originalPrompt?: string;
}

export interface VerificationResult {
  verified: boolean;
  correctedContent?: string;
  issues: string[];
  wordCount: number;
  keywordsFound: string[];
  keywordsMissing: string[];
  improvements: string[];
}

/**
 * Reflection/Verification Layer
 * Reviews generated content and corrects any mistakes
 */
export const verifyAndCorrectContent = async (
  contentToVerify: ContentToVerify
): Promise<VerificationResult> => {
  const { content, task, keywords, maxWords, originalPrompt } = contentToVerify;

  // Quick checks
  const wordCount = content.split(/\s+/).filter((w: string) => w.length > 0).length;
  const contentLower = content.toLowerCase();
  
  // Fuzzy keyword matching - check for base keywords (without location suffixes)
  const keywordsFound: string[] = [];
  const keywordsMissing: string[] = [];
  
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    // Check if full keyword appears
    if (contentLower.includes(kwLower)) {
      keywordsFound.push(kw);
    } else {
      // Check base keyword (without location suffix)
      const baseKw = kwLower.replace(/,\s*(long valley|hackettstown|califon|tewksbury|flanders|budd lake|chester|mendham|peapack and gladstone),\s*nj/i, '').trim();
      // Check if base keyword appears (for phrases like "family dentist" in "family dentist in Long Valley")
      if (baseKw && contentLower.includes(baseKw)) {
        keywordsFound.push(kw);
      } else {
        keywordsMissing.push(kw);
      }
    }
  }

  const issues: string[] = [];
  const improvements: string[] = [];

  // Check word count
  if (wordCount > maxWords) {
    issues.push(`Word count (${wordCount}) exceeds maximum (${maxWords})`);
  }

  // Additional verification: ensure "Malama Dental" is mentioned
  if (!contentLower.includes('malama dental')) {
    issues.push('Practice name "Malama Dental" not found in content');
  }

  // If no issues, return early
  if (issues.length === 0 && keywordsMissing.length === 0) {
    return {
      verified: true,
      issues: [],
      wordCount,
      keywordsFound,
      keywordsMissing: [],
      improvements: [],
    };
  }

  // Get business name dynamically
  const businessName = process.env.BUSINESS_NAME || 'Malama Dental';
  
  // Use LLM to correct issues
  const correctionPrompt = `You are a content quality reviewer for ${businessName}. Review and correct the following ${task}:

Original Content:
${content}

Requirements:
- Maximum ${maxWords} words (STRICT LIMIT - current: ${wordCount} words, MUST REDUCE)
- Must include ALL keywords: ${keywords.join(', ')}
- Missing keywords: ${keywordsMissing.length > 0 ? keywordsMissing.join(', ') : 'None'}
- Current issues: ${issues.join('; ')}
- Must mention "${businessName}" naturally in the content

Task: ${task === 'blog_post' || task === 'seo_post' ? `Google Business Profile post for ${businessName}` : `Review reply for ${businessName}`}

${originalPrompt ? `Original prompt context:\n${originalPrompt.substring(0, 500)}\n` : ''}

Correct the content to:
1. REDUCE word count to EXACTLY ${maxWords} words or less (currently ${wordCount} words - be aggressive in cutting)
2. Include ALL missing keywords naturally: ${keywordsMissing.join(', ')}
3. Maintain quality, tone, and readability
4. Keep it concise, precise, and impactful
5. Ensure "${businessName}" is mentioned naturally

Return JSON with:
- correctedContent: The corrected version (STRICT: ${maxWords} words or less, all ${keywords.length} keywords included)
- improvements: Array of improvements made
- wordCount: Final word count (must be <= ${maxWords})

CRITICAL: The corrected content MUST be ${maxWords} words or less. If current content is ${wordCount} words, you MUST cut at least ${wordCount - maxWords} words while keeping all keywords.`;

  try {
    const response = await llmService.generate({
      prompt: correctionPrompt,
      responseFormat: 'json',
    });

    let parsed: any;
    try {
      let responseContent = response.content.trim();
      // Clean up markdown code blocks if present
      responseContent = responseContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(responseContent);
    } catch (parseError) {
      // If parsing fails, try to extract content directly
      throw new Error(`Failed to parse correction response: ${response.content.substring(0, 200)}`);
    }
    
    let correctedContent = parsed.correctedContent || parsed.content || content;
    
    // If correctedContent is still in JSON format, extract it
    if (typeof correctedContent === 'object') {
      correctedContent = correctedContent.text || correctedContent.summary || correctedContent.post || JSON.stringify(correctedContent);
    }
    const finalWordCount = correctedContent.split(/\s+/).filter((w: string) => w.length > 0).length;
    const finalKeywordsFound = keywords.filter(kw => 
      correctedContent.toLowerCase().includes(kw.toLowerCase())
    );
    const finalKeywordsMissing = keywords.filter(kw => 
      !correctedContent.toLowerCase().includes(kw.toLowerCase())
    );

    return {
      verified: finalWordCount <= maxWords && finalKeywordsMissing.length === 0,
      correctedContent,
      issues: finalWordCount > maxWords || finalKeywordsMissing.length > 0 
        ? [`Word count: ${finalWordCount}/${maxWords}`, ...finalKeywordsMissing.map(k => `Missing: ${k}`)]
        : [],
      wordCount: finalWordCount,
      keywordsFound: finalKeywordsFound,
      keywordsMissing: finalKeywordsMissing,
      improvements: parsed.improvements || ['Content corrected'],
    };
  } catch (error: any) {
    // If LLM correction fails, return with issues noted
    return {
      verified: false,
      issues,
      wordCount,
      keywordsFound,
      keywordsMissing,
      improvements: ['LLM correction failed - manual review needed'],
    };
  }
};

/**
 * Verify content meets requirements (quick check without LLM)
 */
export const quickVerify = (content: string, keywords: string[], maxWords: number): {
  verified: boolean;
  wordCount: number;
  keywordsFound: string[];
  keywordsMissing: string[];
} => {
  const wordCount = content.split(/\s+/).filter((w: string) => w.length > 0).length;
  const keywordsFound = keywords.filter(kw => 
    content.toLowerCase().includes(kw.toLowerCase())
  );
  const keywordsMissing = keywords.filter(kw => 
    !content.toLowerCase().includes(kw.toLowerCase())
  );

  return {
    verified: wordCount <= maxWords && keywordsMissing.length === 0,
    wordCount,
    keywordsFound,
    keywordsMissing,
  };
};

