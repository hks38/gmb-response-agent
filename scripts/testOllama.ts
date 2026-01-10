import dotenv from 'dotenv';
import { llmService } from '../src/services/llmService';

dotenv.config();

const main = async () => {
  console.log('🧪 Testing Ollama/Llama 3 Integration\n');

  // Check environment variables
  console.log('📋 Configuration:');
  console.log(`  OLLAMA_API_URL: ${process.env.OLLAMA_API_URL || 'not set (default: http://localhost:11434)'}`);
  console.log(`  OLLAMA_MODEL: ${process.env.OLLAMA_MODEL || 'not set (default: llama3)'}`);
  console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ set' : '❌ not set'}`);
  console.log();

  // Test with a simple prompt
  const testPrompt = `You are a helpful assistant. Respond with a JSON object containing:
{
  "test": "success",
  "model": "your model name",
  "provider": "ollama"
}

Just return the JSON, nothing else.`;

  console.log('🔄 Testing LLM service...\n');
  console.log('Prompt:', testPrompt);
  console.log();

  try {
    const response = await llmService.generate({
      prompt: testPrompt,
      responseFormat: 'json',
    });

    console.log('✅ Success!');
    console.log(`  Provider: ${response.provider}`);
    console.log(`  Model: ${response.model || 'unknown'}`);
    console.log(`  Response: ${response.content.substring(0, 200)}${response.content.length > 200 ? '...' : ''}`);
    console.log();

    // Try to parse JSON
    try {
      const parsed = JSON.parse(response.content);
      console.log('✅ JSON parsed successfully:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('⚠️  Response is not valid JSON (this is okay for testing)');
      console.log('Full response:', response.content);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error();
    console.error('Troubleshooting:');
    console.error('  1. Make sure Ollama is running: ollama serve');
    console.error('  2. Make sure the model is pulled: ollama pull llama3');
    console.error('  3. Check OLLAMA_API_URL in .env matches your Ollama server');
    process.exit(1);
  }
};

main();
