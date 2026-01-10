import { reviewPrompt } from '../prompts/reviewPrompt';
import { ReviewAnalysis } from '../types';
import { getWebsiteContext } from './websiteContext';
import { llmService } from './llmService';
import { generateEnhancedContent } from './enhancedContentGenerator';
import { getBusinessConfig } from './businessConfig';

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
}): Promise<ReviewAnalysis> => {
  // Fetch website context (cached for 24 hours)
  const practiceInfo = await getWebsiteContext();

  // First, get analysis (sentiment, urgency, topics, etc.)
  const analysisPrompt = reviewPrompt({
    authorName: params.authorName,
    rating: params.rating,
    comment: params.comment,
    createTime: params.createTime,
    practiceInfo,
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

  // Get business config for context
  const businessConfig = await getBusinessConfig();
  
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
  
  // Generate reply using enhanced 3-layer system
  console.log('🔧 Generating reply with 3-layer system...');
  const replyResult = await generateEnhancedContent({
    task: 'review_reply',
    keywords: keywords,
    topic: `Reply to ${params.rating}-star review${params.comment ? `: "${params.comment.substring(0, 50)}..."` : ''}`,
    maxWords: 150, // Maximum 150 words
    minWords: 25, // Minimum 25 words
    tone: 'warm, spa-like, calming',
    style: 'concise and professional',
    additionalContext: `
Business Name: ${businessConfig.name}
Location: ${businessConfig.location}
Reviewer First Name: ${reviewerFirstName} (use ONLY the first name in greeting, never the full name)

Review Details:
- Rating: ${params.rating}/5
- Comment: ${params.comment || '(no comment)'}
- Sentiment: ${parsed.sentiment}
- Urgency: ${parsed.urgency}

Rules:
- Start with "Dear ${reviewerFirstName}," (use ONLY the first name, e.g., "Will", not "Will Tagliareni")
- End with exactly: "Warm regards,\n${businessConfig.name} Team" (new line after comma)
- NEVER use placeholders like [Reviewer's Name], [Your Name], [Name], or any bracketed placeholders
- NEVER repeat the name in the greeting (e.g., don't write "Dear Will Tagliareni, Will" - only "Dear Will,")
- Word count: MINIMUM 25 words, MAXIMUM 150 words (MUST be at least 25 words)
- Sign as ${businessConfig.name} Team (not as an individual)
- Never confirm someone is a patient
- Never mention procedures unless reviewer did
- No personal health info
- If rating <= 3 or sentiment negative, invite contact and do not argue
- If no comment, write a short thank-you (but still at least 25 words)
- The reply_draft must be ready to post - use ONLY first name "${reviewerFirstName}" in greeting, never use placeholders
`,
  });

  console.log(`✓ Reply generated (${replyResult.wordCount} words, verified: ${replyResult.verified})`);

  // Post-process reply to fix placeholders and ensure proper format
  let cleanedReply = replyResult.content;
  
  // Remove ALL variations of [Your Name] placeholder
  cleanedReply = cleanedReply.replace(/\[Your Name\][\s,.-]*/gi, '');
  cleanedReply = cleanedReply.replace(/\[your name\][\s,.-]*/gi, '');
  cleanedReply = cleanedReply.replace(/\[Your name\][\s,.-]*/gi, '');
  cleanedReply = cleanedReply.replace(/\[YOUR NAME\][\s,.-]*/g, '');
  cleanedReply = cleanedReply.replace(/\[Name\][\s,.-]*/gi, '');
  cleanedReply = cleanedReply.replace(/\[name\][\s,.-]*/gi, '');
  
  // Replace ALL variations of [Reviewer's Name] with FIRST NAME ONLY
  cleanedReply = cleanedReply.replace(/\[Reviewer's Name\]/gi, reviewerFirstName);
  cleanedReply = cleanedReply.replace(/\[reviewer's name\]/gi, reviewerFirstName);
  cleanedReply = cleanedReply.replace(/\[REVIEWER'S NAME\]/g, reviewerFirstName);
  cleanedReply = cleanedReply.replace(/\[Reviewer Name\]/gi, reviewerFirstName);
  cleanedReply = cleanedReply.replace(/\[reviewer name\]/gi, reviewerFirstName);
  cleanedReply = cleanedReply.replace(/\[REVIEWER NAME\]/g, reviewerFirstName);
  cleanedReply = cleanedReply.replace(/\[Reviewer\]/gi, reviewerFirstName);
  cleanedReply = cleanedReply.replace(/\[reviewer\]/gi, reviewerFirstName);
  
  // Fix "Dear" greeting - replace any brackets or placeholders with FIRST NAME ONLY
  cleanedReply = cleanedReply.replace(/^Dear\s+\[.*?\]\s*,?\s*/gim, `Dear ${reviewerFirstName}, `);
  cleanedReply = cleanedReply.replace(/^Dear\s*$\s*/gim, `Dear ${reviewerFirstName}, `);
  
  // Fix "Dear [Full Name], [First Name]" pattern - extract and use only first name
  // Pattern: "Dear Will Tagliareni, Will" -> "Dear Will,"
  if (fullReviewerName !== reviewerFirstName && fullReviewerName !== 'Valued Patient') {
    const fullNameEscaped = fullReviewerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const firstNameEscaped = reviewerFirstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Fix "Dear Full Name, First Name" pattern
    cleanedReply = cleanedReply.replace(
      new RegExp(`^Dear\\s+${fullNameEscaped}\\s*,\\s*${firstNameEscaped}\\s*`, 'gim'),
      `Dear ${reviewerFirstName}, `
    );
    
    // Replace "Dear Full Name," with "Dear First Name,"
    cleanedReply = cleanedReply.replace(
      new RegExp(`^Dear\\s+${fullNameEscaped}\\s*,?\\s*`, 'gim'),
      `Dear ${reviewerFirstName}, `
    );
  }
  
  // Ensure reply starts with "Dear [first name]," format
  if (!/^Dear\s/i.test(cleanedReply.trim())) {
    cleanedReply = `Dear ${reviewerFirstName},\n\n${cleanedReply.trim()}`;
  } else {
    // Fix any remaining greeting to use only first name
    cleanedReply = cleanedReply.replace(/^Dear\s+.*?,?\s*/gim, (match) => {
      // If it contains brackets or looks like a placeholder, replace with first name
      if (/\[.*?\]/.test(match)) {
        return `Dear ${reviewerFirstName}, `;
      }
      // Extract the name from the greeting
      const nameMatch = match.match(/Dear\s+([^,]+)/i);
      if (nameMatch && nameMatch[1]) {
        const currentName = nameMatch[1].trim();
        // If the current name is longer than the first name (contains full name), replace it
        if (fullReviewerName !== reviewerFirstName && 
            fullReviewerName !== 'Valued Patient' &&
            currentName.toLowerCase().includes(fullReviewerName.toLowerCase()) &&
            currentName.length > reviewerFirstName.length) {
          return `Dear ${reviewerFirstName}, `;
        }
        // If it doesn't match the first name, replace with first name
        if (currentName.toLowerCase() !== reviewerFirstName.toLowerCase()) {
          return `Dear ${reviewerFirstName}, `;
        }
      }
      // If we can't extract a name or it doesn't match, use first name
      if (!nameMatch || !new RegExp(reviewerFirstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(match)) {
        return `Dear ${reviewerFirstName}, `;
      }
      return match;
    });
  }
  
  // Remove any closing signatures that might have placeholders
  cleanedReply = cleanedReply.replace(/\n\s*Warm regards,?\s*\n\s*\[.*?\]\s*\n\s*.*?Team\s*$/gim, '');
  cleanedReply = cleanedReply.replace(/\n\s*Best regards,?\s*\n\s*\[.*?\]\s*\n\s*.*?Team\s*$/gim, '');
  cleanedReply = cleanedReply.replace(/\n\s*Sincerely,?\s*\n\s*\[.*?\]\s*\n\s*.*?Team\s*$/gim, '');
  
  // Check if reply already ends with proper closing signature
  const businessNameEscaped = businessConfig.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasProperClosing = new RegExp(
    `(Warm regards|Best regards|Sincerely),\\s*\\n\\s*${businessNameEscaped}\\s+Team\\s*$`,
    'i'
  ).test(cleanedReply.trim());
  
  // Remove any trailing placeholders or incomplete signatures
  cleanedReply = cleanedReply.replace(/\n\s*\[.*?\]\s*$/gim, '');
  cleanedReply = cleanedReply.replace(/\n\s*,\s*$/gim, '');
  
  // Trim trailing whitespace
  cleanedReply = cleanedReply.trim();
  
  // Add proper closing signature if not present
  if (!hasProperClosing) {
    // Remove any existing incomplete closings
    cleanedReply = cleanedReply.replace(/\n\s*(Warm regards|Best regards|Sincerely),?\s*.*?$/gim, '');
    
    // Ensure there's proper spacing before closing
    if (!cleanedReply.endsWith('\n')) {
      cleanedReply += '\n\n';
    }
    
    // Add the proper closing signature
    cleanedReply += `Warm regards,\n${businessConfig.name} Team`;
  } else {
    // Ensure existing closing is in correct format
    cleanedReply = cleanedReply.replace(
      /(Warm regards|Best regards|Sincerely),?\s*\n\s*.*?$/gim,
      `Warm regards,\n${businessConfig.name} Team`
    );
  }
  
  // Clean up any excessive line breaks (more than 2 consecutive)
  cleanedReply = cleanedReply.replace(/\n{3,}/g, '\n\n');
  
  // FINAL CHECK: Remove any duplicate or repeated names
  // This catches edge cases where the LLM might have included the name multiple times
  const firstNameEscaped = reviewerFirstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 1. Fix "Dear [Full Name], [First Name]" or "Dear [First Name], [First Name]" patterns
  // Pattern: "Dear Will Tagliareni, Will" or "Dear Will, Will"
  cleanedReply = cleanedReply.replace(
    /^Dear\s+([^,]+),\s*\1\s*,?\s*/gim,
    (match, name) => {
      // Extract just the first name if it's a full name
      const firstName = name.trim().split(/\s+/)[0];
      return `Dear ${firstName}, `;
    }
  );
  
  // 2. Remove any duplicate first name that appears right after the greeting comma
  // Pattern: "Dear Will, Will " or "Dear Will, Will," or "Dear Will, Will\n"
  cleanedReply = cleanedReply.replace(
    new RegExp(`^Dear\\s+${firstNameEscaped}\\s*,\\s*${firstNameEscaped}\\s*,?\\s*`, 'gim'),
    `Dear ${reviewerFirstName}, `
  );
  
  // 3. Ensure greeting only contains first name - remove any middle/last name
  if (fullReviewerName !== reviewerFirstName && fullReviewerName !== 'Valued Patient') {
    const fullNameEscaped = fullReviewerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fullNameWords = fullReviewerName.split(/\s+/);
    
    // Fix "Dear Full Name, First Name" pattern
    cleanedReply = cleanedReply.replace(
      new RegExp(`^Dear\\s+${fullNameEscaped}\\s*,\\s*${firstNameEscaped}\\s*,?\\s*`, 'gim'),
      `Dear ${reviewerFirstName}, `
    );
    
    if (fullNameWords.length > 1) {
      const lastName = fullNameWords[fullNameWords.length - 1];
      const lastNameEscaped = lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Remove last name if it appears in the greeting line after first name
      cleanedReply = cleanedReply.replace(
        new RegExp(`^Dear\\s+${firstNameEscaped}\\s+${lastNameEscaped}\\s*,?\\s*`, 'gim'),
        `Dear ${reviewerFirstName}, `
      );
      
      // Fix "Dear First Name Last Name, First Name" pattern
      cleanedReply = cleanedReply.replace(
        new RegExp(`^Dear\\s+${firstNameEscaped}\\s+${lastNameEscaped}\\s*,\\s*${firstNameEscaped}\\s*,?\\s*`, 'gim'),
        `Dear ${reviewerFirstName}, `
      );
    }
  }
  
  // 4. Remove any instances of full name appearing after the greeting (but be careful with partial matches)
  if (fullReviewerName !== reviewerFirstName && fullReviewerName !== 'Valued Patient') {
    const fullNameEscaped = fullReviewerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Split reply into greeting line and body
    const lines = cleanedReply.split('\n');
    if (lines.length > 0) {
      // Fix greeting line (already done above, but double-check)
      lines[0] = lines[0].replace(
        new RegExp(`^Dear\\s+${fullNameEscaped}\\s*,?\\s*`, 'gi'),
        `Dear ${reviewerFirstName}, `
      );
      
      // In the body (lines after greeting), remove standalone full name if it appears
      // This handles cases where the full name might appear as a standalone word
      for (let i = 1; i < lines.length; i++) {
        // Remove full name only if it's a standalone word (not part of another word)
        lines[i] = lines[i].replace(
          new RegExp(`\\b${fullNameEscaped}\\b`, 'gi'),
          reviewerFirstName
        );
      }
      cleanedReply = lines.join('\n');
    }
  }
  
  // 5. Final cleanup: Remove any trailing commas or spaces after the greeting
  cleanedReply = cleanedReply.replace(/^(Dear\s+[^,]+),\s*,+\s*/gim, '$1, ');
  
  // 6. Ensure greeting is properly formatted: "Dear [First Name], " (comma and space, no duplicate names)
  // This is the final pass to catch anything that slipped through
  cleanedReply = cleanedReply.replace(
    new RegExp(`^Dear\\s+${firstNameEscaped}\\s*,\\s*${firstNameEscaped}\\b`, 'gim'),
    `Dear ${reviewerFirstName}, `
  );
  
  // 7. ONE MORE PASS: Check for any remaining name repetition patterns and fix them
  // Match "Dear [anything], [anything that starts with same word]" and fix
  cleanedReply = cleanedReply.replace(
    /^Dear\s+([^,\n]+),\s*\1\s*,?\s*/gim,
    (match, name) => {
      const firstName = name.trim().split(/\s+/)[0];
      return `Dear ${firstName}, `;
    }
  );
  
  // Final trim
  cleanedReply = cleanedReply.trim();
  
  // FINAL VALIDATION: Log warning if name still appears multiple times in greeting
  const greetingMatch = cleanedReply.match(/^Dear\s+([^,\n]+),/i);
  if (greetingMatch && greetingMatch[1]) {
    const nameInGreeting = greetingMatch[1].trim();
    const wordsInGreeting = nameInGreeting.split(/\s+/);
    // If greeting contains more than just the first name, log a warning
    if (wordsInGreeting.length > 1 && fullReviewerName !== 'Valued Patient') {
      console.warn(`⚠️  Warning: Greeting still contains multiple words: "${nameInGreeting}". Expected only first name: "${reviewerFirstName}"`);
    }
    // Check if greeting has duplicate names
    if (nameInGreeting.toLowerCase().includes(reviewerFirstName.toLowerCase()) && 
        nameInGreeting.toLowerCase() !== reviewerFirstName.toLowerCase()) {
      console.warn(`⚠️  Warning: Possible name duplication in greeting: "${nameInGreeting}"`);
    }
  }

    return {
      sentiment: parsed.sentiment,
      urgency: parsed.urgency,
      topics: parsed.topics || [],
      suggested_actions: parsed.suggested_actions || [],
      risk_flags: parsed.risk_flags || [],
    reply_draft: cleanedReply, // Use cleaned reply with placeholders replaced
    };
};

