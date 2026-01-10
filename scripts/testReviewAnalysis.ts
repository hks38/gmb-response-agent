import dotenv from 'dotenv';
import { analyzeReview } from '../src/services/analysisService';

dotenv.config();

const main = async () => {
  console.log('🧪 Testing Review Analysis with Ollama/Llama 3\n');

  // Check which provider will be used
  console.log('📋 Configuration:');
  console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ set (will try first)' : '❌ not set (will use Ollama directly)'}`);
  console.log(`  OLLAMA_API_URL: ${process.env.OLLAMA_API_URL || 'http://localhost:11434 (default)'}`);
  console.log(`  OLLAMA_MODEL: ${process.env.OLLAMA_MODEL || 'llama3 (default)'}`);
  console.log();

  // Test with a sample review
  const testReview = {
    authorName: 'John Doe',
    rating: 5,
    comment: 'Great experience! The staff was friendly and the cleaning was thorough. Highly recommend!',
    createTime: new Date().toISOString(),
  };

  console.log('📝 Test Review:');
  console.log(`  Author: ${testReview.authorName}`);
  console.log(`  Rating: ${testReview.rating}⭐`);
  console.log(`  Comment: ${testReview.comment}`);
  console.log();

  console.log('🔄 Analyzing review...\n');

  try {
    const startTime = Date.now();
    const analysis = await analyzeReview(testReview);
    const duration = Date.now() - startTime;

    console.log('✅ Analysis Complete!');
    console.log(`  ⏱️  Duration: ${duration}ms`);
    console.log();
    console.log('📊 Results:');
    console.log(`  Sentiment: ${analysis.sentiment}`);
    console.log(`  Urgency: ${analysis.urgency}`);
    console.log(`  Topics: ${analysis.topics.join(', ')}`);
    console.log(`  Suggested Actions: ${analysis.suggested_actions.join(', ')}`);
    console.log(`  Risk Flags: ${analysis.risk_flags.length > 0 ? analysis.risk_flags.join(', ') : 'None'}`);
    console.log();
    console.log('💬 Reply Draft:');
    console.log(`  ${analysis.reply_draft}`);
    console.log();
    console.log('✅ Test successful! Ollama/Llama 3 is working correctly for review analysis.');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error();
    console.error('Troubleshooting:');
    console.error('  1. Make sure Ollama is running: ollama serve');
    console.error('  2. Make sure the model is pulled: ollama pull llama3');
    console.error('  3. Check your .env file has OLLAMA_API_URL and OLLAMA_MODEL set');
    console.error('  4. If OpenAI is set, it will try OpenAI first, then fall back to Ollama');
    process.exit(1);
  }
};

main();
