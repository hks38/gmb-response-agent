# Using Llama 3 (Ollama) as Fallback

The review response agent now supports using Llama 3 (via Ollama) as a fallback when OpenAI quota is reached!

## Setup Ollama

### 1. Install Ollama

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download from https://ollama.ai/download

### 2. Start Ollama Server

```bash
ollama serve
```

This starts the server on `http://localhost:11434` (default).

### 3. Pull Llama 3 Model

```bash
ollama pull llama3
```

Or for other models:
- `ollama pull llama3.1` (newer version)
- `ollama pull mistral`
- `ollama pull codellama`

### 4. Configure Environment Variables

Add to your `.env` file:

```env
# Ollama Configuration (optional - used as fallback)
OLLAMA_API_URL="http://localhost:11434"
OLLAMA_MODEL="llama3"
```

## How It Works

1. **Primary**: The agent tries OpenAI first
2. **Fallback**: If OpenAI quota is exceeded (429 error) or fails, it automatically falls back to Ollama/Llama 3
3. **Seamless**: You don't need to change any code - it just works!

## Testing

To test with Ollama only (skip OpenAI), temporarily remove or comment out `OPENAI_API_KEY` in `.env`.

## Performance Notes

- **Ollama runs locally** - No API costs, but uses your machine's resources
- **Response time**: May be slower than OpenAI depending on your hardware
- **Quality**: Llama 3 produces good results, though OpenAI GPT-4o-mini may be slightly better
- **JSON mode**: Ollama supports JSON format, which works well for structured responses

## Troubleshooting

### "Connection refused" error
- Make sure Ollama server is running: `ollama serve`
- Check that `OLLAMA_API_URL` matches your Ollama server URL

### "Model not found" error
- Pull the model: `ollama pull llama3`
- Check that `OLLAMA_MODEL` matches the model name you pulled

### Slow responses
- Use a smaller/faster model like `llama3` (not `llama3.1` or `llama3:70b`)
- Ensure you have enough RAM/CPU
- Consider using OpenAI for production (faster, more reliable)

## Example .env Configuration

```env
# Primary LLM
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"

# Fallback LLM (optional)
OLLAMA_API_URL="http://localhost:11434"
OLLAMA_MODEL="llama3"
```

With this setup, if OpenAI quota is exceeded, the agent automatically uses Llama 3 locally!

