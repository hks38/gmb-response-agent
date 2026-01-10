import { generateOptimizedPrompt, PromptContext } from './promptEngineer';
import { verifyAndCorrectContent, ContentToVerify } from './reflectionLayer';
import { llmService } from './llmService';
import { getWebsiteContext } from './websiteContext';
import { getBusinessConfig, getBusinessName } from './businessConfig';

export interface EnhancedGenerationOptions {
  task: 'blog_post' | 'review_reply' | 'seo_post';
  keywords: string[];
  topic?: string;
  maxWords?: number;
  minWords?: number;
  tone?: string;
  style?: string;
  additionalContext?: string;
}

export interface EnhancedGenerationResult {
  content: string;
  wordCount: number;
  keywordsIncluded: string[];
  verified: boolean;
  iterations: number;
  promptUsed: string;
  verificationIssues: string[];
}

/**
 * Enhanced Content Generator with 3-layer system:
 * 1. Prompt Engineering Layer
 * 2. Content Generation Layer
 * 3. Reflection/Verification Layer
 */
export const generateEnhancedContent = async (
  options: EnhancedGenerationOptions
): Promise<EnhancedGenerationResult> => {
  const {
    task,
    keywords,
    topic,
    maxWords = 150,
    minWords = task === 'review_reply' ? 25 : undefined,
    tone = 'warm, friendly, professional',
    style = 'concise and engaging',
    additionalContext = '',
  } = options;

  // Get business configuration
  const businessConfig = await getBusinessConfig();
  
  // Get practice context if available
  let practiceContext = '';
  try {
    const practiceInfo = await getWebsiteContext();
    if (practiceInfo) {
      practiceContext = `
Practice Information:
- Name: ${businessConfig.name}
- Location: ${businessConfig.location}
- Services: ${practiceInfo.services.join(', ')}
- USPs: ${practiceInfo.unique_selling_points.join(', ')}
`;
    } else {
      // Fallback to business config
      practiceContext = `
Business Information:
- Name: ${businessConfig.name}
- Location: ${businessConfig.location}
- Website: ${businessConfig.websiteUrl}
`;
    }
  } catch (error) {
    // Use business config as fallback
    practiceContext = `
Business Information:
- Name: ${businessConfig.name}
- Location: ${businessConfig.location}
- Website: ${businessConfig.websiteUrl}
`;
  }

  // Always ensure business name is mentioned in the context
  const fullAdditionalContext = `${practiceContext}\n${additionalContext}\n\nIMPORTANT: Always mention "${businessConfig.name}" naturally in the content. Business name is ${businessConfig.name} - use this exact name consistently.`.trim();

  // ============================================
  // LAYER 1: PROMPT ENGINEERING
  // ============================================
  console.log('🔧 Layer 1: Prompt Engineering...');
  
  const promptContext: PromptContext = {
    task,
    keywords,
    topic,
    constraints: {
      maxWords,
      minWords,
      minKeywords: keywords.length,
      tone,
      style,
    },
    additionalContext: fullAdditionalContext,
  };

  const { prompt: optimizedPrompt, reasoning } = await generateOptimizedPrompt(promptContext);
  console.log(`   ✓ Prompt generated (reasoning: ${reasoning.substring(0, 50)}...)`);

  // ============================================
  // LAYER 2: CONTENT GENERATION
  // ============================================
  console.log('✍️  Layer 2: Content Generation...');
  
  let content = '';
  let iterations = 0;
  const maxIterations = 3;

  while (iterations < maxIterations) {
    try {
      // For JSON format, ensure prompt mentions JSON
      const finalPrompt = task === 'review_reply' 
        ? optimizedPrompt
        : `${optimizedPrompt}\n\nReturn JSON format with the content.`;

      const response = await llmService.generate({
        prompt: finalPrompt,
        responseFormat: task === 'review_reply' ? 'text' : 'json',
      });

      // Parse response based on format
      // Ensure content is a string
      let rawContent = typeof response.content === 'string' 
        ? response.content 
        : String(response.content || '');
      
      rawContent = rawContent.trim();
      
      // Clean up markdown code blocks first
      rawContent = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      
      if (task === 'review_reply') {
        // For review replies, expect plain text
        content = rawContent;
      } else {
        // For posts, try to parse JSON
        try {
          const parsed = JSON.parse(rawContent);
          // Handle various JSON structures
          content = parsed.summary || 
                   parsed.content || 
                   parsed.post || 
                   parsed.text ||
                   parsed.blogPost?.text || 
                   parsed.blogPost?.content ||
                   parsed.blogPost?.summary ||
                   (typeof parsed === 'string' ? parsed : rawContent);
          
          // Ensure content is a string
          if (typeof content !== 'string') {
            content = String(content || '');
          }
        } catch (parseError) {
          // If parsing fails, check if it's a JSON string that needs another parse
          if (rawContent.startsWith('{') && rawContent.includes('"')) {
            try {
              // Try to extract text from malformed JSON using regex
              const textMatch = rawContent.match(/"text"\s*:\s*"([^"]+)"/i) ||
                               rawContent.match(/"content"\s*:\s*"([^"]+)"/i) ||
                               rawContent.match(/"summary"\s*:\s*"([^"]+)"/i);
              content = textMatch ? textMatch[1] : rawContent;
            } catch {
              content = rawContent;
            }
          } else {
            // Use as plain text
            content = rawContent;
          }
        }
      }
      
      // Final validation: ensure content is a non-empty string
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('Generated content is empty or invalid');
      }
      
      content = content.trim();
      
      // Final cleanup - remove any remaining JSON artifacts
      content = content.trim();

      const wordCount = content.split(/\s+/).filter((w: string) => w.length > 0).length;
      console.log(`   ✓ Content generated (${wordCount} words)`);
      break;
    } catch (error: any) {
      iterations++;
      if (iterations >= maxIterations) {
        throw new Error(`Content generation failed after ${maxIterations} attempts: ${error.message}`);
      }
      console.log(`   ⚠️  Attempt ${iterations} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // ============================================
  // LAYER 3: REFLECTION/VERIFICATION
  // ============================================
  console.log('🔍 Layer 3: Reflection & Verification...');
  
  const verificationResult = await verifyAndCorrectContent({
    content,
    task,
    keywords,
    maxWords,
    minWords,
    originalPrompt: optimizedPrompt,
  });

  if (verificationResult.verified) {
    console.log(`   ✓ Content verified (${verificationResult.wordCount} words, all keywords included)`);
  } else {
    console.log(`   ⚠️  Issues found: ${verificationResult.issues.join(', ')}`);
    if (verificationResult.correctedContent) {
      console.log(`   ✓ Content corrected`);
      content = verificationResult.correctedContent;
    }
  }

  return {
    content: verificationResult.correctedContent || content,
    wordCount: verificationResult.wordCount,
    keywordsIncluded: verificationResult.keywordsFound,
    verified: verificationResult.verified,
    iterations: iterations + 1,
    promptUsed: optimizedPrompt,
    verificationIssues: verificationResult.issues,
  };
};

