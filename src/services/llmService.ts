import OpenAI from 'openai';
import axios from 'axios';

export interface LLMResponse {
  content: string;
  model?: string;
  provider: string;
}

export interface LLMOptions {
  prompt: string;
  responseFormat?: 'json' | 'text';
}

/**
 * Unified LLM service with fallback support
 * Supports: OpenAI (primary), Ollama (Llama 3, etc.), and future providers
 */
export class LLMService {
  private openai: OpenAI | null = null;
  private ollamaUrl: string;
  private ollamaModel: string;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    this.ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3';
  }

  /**
   * Generate a response using available LLM providers with fallback
   */
  async generate(options: LLMOptions): Promise<LLMResponse> {
    const errors: string[] = [];

    // Try OpenAI first
    if (this.openai) {
      try {
        return await this.generateOpenAI(options);
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        errors.push(`OpenAI: ${errorMsg}`);
        
        // If quota exceeded, try fallback
        if (error.status === 429 || error.code === 'insufficient_quota' || errorMsg.includes('quota')) {
          console.log('OpenAI quota exceeded, trying fallback...');
        } else {
          // For other errors, still try fallback but log the error
          console.warn('OpenAI error:', errorMsg);
        }
      }
    }

    // Try Ollama (Llama 3, etc.)
    try {
      return await this.generateOllama(options);
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      errors.push(`Ollama: ${errorMsg}`);
    }

    // If all providers failed, throw comprehensive error
    throw new Error(
      `All LLM providers failed:\n${errors.join('\n')}\n\n` +
      `Make sure at least one provider is configured:\n` +
      `- OpenAI: Set OPENAI_API_KEY\n` +
      `- Ollama: Run 'ollama serve' and set OLLAMA_API_URL (default: http://localhost:11434)`
    );
  }

  private async generateOpenAI(options: LLMOptions): Promise<LLMResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: options.prompt }],
      response_format: options.responseFormat === 'json' ? { type: 'json_object' as const } : undefined,
    });

    const content = completion.choices[0]?.message?.content || '';
    return {
      content,
      model,
      provider: 'openai',
    };
  }

  private async generateOllama(options: LLMOptions): Promise<LLMResponse> {
    const url = `${this.ollamaUrl}/api/generate`;
    
    // Format prompt for JSON response if needed
    let prompt = options.prompt;
    if (options.responseFormat === 'json') {
      prompt += '\n\nRespond with valid JSON only, no markdown, no code blocks.';
    }

    const response = await axios.post(
      url,
      {
        model: this.ollamaModel,
        prompt,
        stream: false,
        format: options.responseFormat === 'json' ? 'json' : undefined,
      },
      {
        timeout: 300000, // 300 second timeout (5 minutes) - Llama 3 can be slow for complex prompts
      }
    );

    const content = response.data.response || '';
    
    // Clean up JSON if needed (remove markdown code blocks)
    let cleanedContent = content.trim();
    if (options.responseFormat === 'json') {
      // Remove markdown code blocks if present
      cleanedContent = cleanedContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    return {
      content: cleanedContent,
      model: this.ollamaModel,
      provider: 'ollama',
    };
  }
}

// Singleton instance
export const llmService = new LLMService();

