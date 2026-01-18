# Enhanced Content Generation - 3-Layer System

The content generation system uses a sophisticated 3-layer approach to ensure high-quality, keyword-optimized content that meets strict word limits.

## Architecture

```
┌─────────────────────────────────────┐
│  Layer 1: Prompt Engineering        │
│  • Analyzes context                 │
│  • Generates optimized prompts      │
│  • Ensures all requirements met     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Layer 2: Content Generation        │
│  • Uses optimized prompt            │
│  • Generates content with LLM       │
│  • Includes all keywords            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Layer 3: Reflection & Verification │
│  • Reviews generated content        │
│  • Checks word count (max 150)      │
│  • Verifies all keywords included   │
│  • Corrects any issues              │
└─────────────────────────────────────┘
```

## Layer 1: Prompt Engineering

**Purpose**: Act as a prompt engineer to create optimized prompts for content generation.

**What it does**:
- Analyzes the task (blog post, review reply, SEO post)
- Reviews keywords that must be included
- Understands constraints (word limit, tone, style)
- Generates a highly optimized prompt

**Output**: A refined prompt optimized for the specific LLM to generate perfect content.

## Layer 2: Content Generation

**Purpose**: Use the optimized prompt to generate actual content.

**What it does**:
- Sends optimized prompt to LLM (OpenAI/Ollama)
- Generates content based on prompt
- Handles JSON parsing for structured responses
- Includes all required keywords

**Output**: Initial content draft (may need refinement).

## Layer 3: Reflection & Verification

**Purpose**: Review and correct generated content to ensure it meets all requirements.

**What it does**:
- **Verifies word count**: Ensures content is ≤ 150 words
- **Checks keywords**: Verifies ALL keywords are included
- **Corrects issues**: Uses LLM to fix any problems
- **Validates quality**: Ensures content is natural and engaging

**Output**: Verified, corrected content that meets all requirements.

## Features

### Strict Word Limits
- **Blog Posts/SEO Posts**: Maximum 150 words (strict enforcement)
- **Review Replies**: Maximum 150 words (strict enforcement)
- Content is automatically trimmed if it exceeds the limit

### Keyword Inclusion
- **All keywords required**: Every specified keyword must appear naturally
- **No keyword stuffing**: Keywords flow naturally in the content
- **Verification**: Reflection layer ensures all keywords are present

### Dynamic Business Name
- **Configurable**: Set `BUSINESS_NAME` in `.env` (default: "Malama Dental")
- **Consistent**: Business name used throughout all generated content
- **Scalable**: Easy to change for different practices

### Quality Assurance
- **3-layer verification**: Multiple checks ensure quality
- **Automatic correction**: Issues are fixed automatically
- **Natural language**: Content reads naturally, not robotic

## Configuration

### Business Name
Set in `.env`:
```env
BUSINESS_NAME="Malama Dental"
BUSINESS_LOCATION="Long Valley, NJ"
BUSINESS_PHONE="908-876-5559"
```

The system will:
1. Use `BUSINESS_NAME` from `.env` if set
2. Fall back to "Malama Dental" if not set
3. Always use the exact business name in all generated content

### Word Limits
Currently set to **150 words maximum** for all content types. This can be adjusted in the code:
- `src/services/enhancedContentGenerator.ts` - `maxWords = 150`
- `src/services/promptEngineer.ts` - Default constraints

## Usage

### Generate Post (Interactive)
```bash
npm run generate-post
```

This will:
1. Generate post using 3-layer system
2. Display the post for review
3. Ask for confirmation before posting
4. Only post if you confirm "yes"

### Generate Post (Non-Interactive)
```bash
npm run generate-smart-post
```

This posts immediately without confirmation (use with caution).

## Example Flow

```
🔧 Layer 1: Prompt Engineering...
   ✓ Prompt generated (reasoning: Clear structure with strict word limit...)

✍️  Layer 2: Content Generation...
   ✓ Content generated (152 words)

🔍 Layer 3: Reflection & Verification...
   ⚠️  Issues found: Word count: 152/150
   ✓ Content corrected (148 words, all keywords included)

📄 POST PREVIEW
   Content: [Display post]
   Word Count: 148 words
   
   ✅ Does this post look correct? Post to Malama Dental GMB? (yes/no):
```

## Benefits

1. **Consistency**: All content follows the same quality standards
2. **Accuracy**: Word limits and keyword requirements are strictly enforced
3. **Efficiency**: Automatic correction reduces manual editing
4. **Scalability**: Easy to adapt for different businesses
5. **Quality**: Multi-layer verification ensures high-quality output

## Integration

The 3-layer system is automatically used by:
- `generateSEOPost()` - For SEO posts
- `analyzeReview()` - For review replies
- `generateSmartPost()` - For smart posts from weekly reports

All content generation goes through these three layers automatically.


