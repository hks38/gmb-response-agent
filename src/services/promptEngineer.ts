import { llmService } from './llmService';

export interface PromptContext {
  task: 'blog_post' | 'review_reply' | 'seo_post';
  keywords: string[];
  topic?: string;
  constraints?: {
    maxWords?: number;
    minKeywords?: number;
    tone?: string;
    style?: string;
  };
  additionalContext?: string;
}

export interface GeneratedPrompt {
  prompt: string;
  reasoning: string;
  expectedOutput: string;
}

/**
 * Prompt Engineering Layer
 * Acts as a prompt engineer to create optimized prompts for content generation
 */
export const generateOptimizedPrompt = async (
  context: PromptContext
): Promise<GeneratedPrompt> => {
  const {
    task,
    keywords,
    topic,
    constraints = {},
    additionalContext = '',
  } = context;

  const {
    maxWords = 150,
    minKeywords = 1,
    tone = 'warm, friendly, professional',
    style = 'concise and engaging',
  } = constraints;

  // Create meta-prompt for prompt engineering
  const metaPrompt = `You are an expert prompt engineer specializing in content generation for dental practices.

Task: ${task}
Topic: ${topic || 'General dental care'}
Keywords to include: ${keywords.join(', ')}
Constraints:
- Maximum words: ${maxWords}
- Minimum keywords to include: ${minKeywords}
- Tone: ${tone}
- Style: ${style}
${additionalContext ? `\nAdditional Context:\n${additionalContext}` : ''}

Your job is to create an optimized prompt that will:
1. Generate ${task === 'blog_post' || task === 'seo_post' ? 'a concise, SEO-optimized post' : 'a warm, professional review reply'}
2. Naturally include ALL specified keywords (${keywords.length} keywords)
3. Stay within ${maxWords} words maximum
4. Maintain ${tone} tone
5. Be ${style}

Generate a prompt that is:
- Clear and specific
- Includes all necessary instructions
- Ensures keyword inclusion without keyword stuffing
- Enforces word limit strictly
- Maintains quality and readability

Return JSON with:
- prompt: The optimized prompt to use for content generation
- reasoning: Brief explanation of why this prompt structure was chosen
- expectedOutput: Description of what the output should look like`;

  try {
    const response = await llmService.generate({
      prompt: `${metaPrompt}\n\nRespond with valid JSON only.`,
      responseFormat: 'json',
    });

    const parsed = JSON.parse(response.content);

    return {
      prompt: parsed.prompt || metaPrompt,
      reasoning: parsed.reasoning || 'Generated optimized prompt',
      expectedOutput: parsed.expectedOutput || 'Concise, keyword-rich content',
    };
  } catch (error: any) {
    // Fallback to a well-structured prompt if LLM fails
    return generateFallbackPrompt(context);
  }
};

/**
 * Generate fallback prompt if LLM fails
 */
const generateFallbackPrompt = (context: PromptContext): GeneratedPrompt => {
  const { task, keywords, topic, constraints = {} } = context;
  const { maxWords = 150, tone = 'warm, friendly, professional' } = constraints;

  let prompt = '';

  // Get business name dynamically
  const businessName = process.env.BUSINESS_NAME || 'Malama Dental';
  
  if (task === 'blog_post' || task === 'seo_post') {
    prompt = `Create a concise Google Business Profile post for ${businessName} about "${topic || 'dental care'}".

Practice Name: ${businessName} (ALWAYS use this exact name, never use variations)

Requirements:
- Maximum ${maxWords} words (STRICT LIMIT - do not exceed)
- Include ALL of these keywords naturally: ${keywords.join(', ')}
- Always mention "${businessName}" naturally in the post
- Tone: ${tone}
- Be precise, informative, and engaging
- Include a clear call-to-action
- No keyword stuffing - keywords must flow naturally

Keywords to include (${keywords.length} total):
${keywords.map((kw, i) => `${i + 1}. ${kw}`).join('\n')}

Return JSON with:
- summary: The post text (maximum ${maxWords} words, STRICT LIMIT)

Write the post now. Ensure every keyword appears naturally, mention "${businessName}", and the word count is exactly ${maxWords} words or less.`;
  } else if (task === 'review_reply') {
    const businessName = process.env.BUSINESS_NAME || 'Malama Dental';
    prompt = `Write a warm, professional reply to a Google review for ${businessName}.

Practice Name: ${businessName} (ALWAYS use this exact name)

Requirements:
- Maximum ${maxWords} words (STRICT LIMIT)
- Include these keywords naturally: ${keywords.join(', ')}
- Always mention "${businessName}" naturally in the reply
- Tone: ${tone}, spa-like, calming
- Never confirm someone is a patient
- Never mention procedures unless reviewer did
- No personal health info
- Include ONE local SEO phrase from: ${keywords.join(', ')}

Write the reply now. Keep it under ${maxWords} words, mention "${businessName}", and include all keywords naturally. Return plain text (not JSON).`;
  }

  return {
    prompt,
    reasoning: 'Fallback prompt with strict word limit and keyword requirements',
    expectedOutput: `Concise ${task} under ${maxWords} words with all keywords included naturally`,
  };
};

