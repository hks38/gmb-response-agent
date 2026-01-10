# Image Generation Setup

The system now automatically generates images for GMB posts using AI (DALL-E 3) and adds your business logo.

## Features

- ✅ **AI Image Generation**: Uses DALL-E 3 to create relevant images based on post topics
- ✅ **Logo Integration**: Automatically adds your business logo to generated images
- ✅ **Banner Format**: Creates 1200x630 pixel banners (optimal for social media)
- ✅ **Automatic**: Images are generated alongside post content

## Requirements

### 1. OpenAI API Key

Ensure your `OPENAI_API_KEY` is set in `.env`:
```env
OPENAI_API_KEY="sk-..."
```

DALL-E 3 requires an OpenAI API key with image generation access.

### 2. Logo File (Optional)

Place your logo file in one of these locations:
- `/assets/logo.png` (recommended)
- `/data/logo.png`
- `/public/logo.png`
- `/logo.png`

If no logo file is found, the image will still be generated but without a logo overlay.

## How It Works

1. **Image Prompt Generation**: The LLM creates an optimized prompt for DALL-E based on:
   - Post topic
   - Keywords
   - Business name
   - Dental practice context

2. **AI Image Generation**: DALL-E 3 generates a 1792x1024 pixel image

3. **Image Processing**: Sharp library:
   - Resizes to 1200x630 banner format
   - Adds logo overlay in top-right corner
   - Adds white background for logo (with padding)

4. **Image Storage**: Generated images are saved to `/data/images/`

5. **Post Integration**: Image path is included in the post metadata

## Image Format

- **Dimensions**: 1200x630 pixels (social media banner format)
- **Format**: PNG
- **Quality**: High resolution (suitable for GMB posts)
- **Logo Position**: Top-right corner with 20px padding
- **Logo Size**: 150x150 pixels (will be scaled automatically)

## Cost Considerations

DALL-E 3 pricing (as of 2024):
- **Standard quality**: $0.040 per image
- **HD quality**: $0.080 per image

Current implementation uses standard quality. Each post generation includes one image.

## Google Business Profile Image Requirements

**Important**: The GMB API requires images to be publicly accessible URLs. The current implementation saves images locally, but you'll need to:

1. **Upload images to cloud storage** (Google Cloud Storage, AWS S3, etc.)
2. **Get public URL** for the image
3. **Use that URL** in the GMB post `media` field

### Example Implementation (TODO)

```typescript
// Upload image to Google Cloud Storage
const publicUrl = await uploadToGCS(imagePath);
// Use publicUrl in GMB post
media: [{
  mediaFormat: 'PHOTO',
  sourceUrl: publicUrl
}]
```

For now, images are generated and saved locally. The image path is included in the post metadata for future upload processing.

## Troubleshooting

### Image Generation Fails

**Error**: `OPENAI_API_KEY not set`
- **Solution**: Add `OPENAI_API_KEY` to your `.env` file

**Error**: `DALL-E API error: 429`
- **Solution**: Rate limit exceeded. Wait a few minutes and try again.

**Error**: `DALL-E API error: 401`
- **Solution**: Invalid API key. Check your OpenAI API key.

### Logo Not Appearing

**Issue**: Logo doesn't appear in generated images
- **Check**: Logo file exists in one of the expected locations
- **Check**: Logo file is readable (not corrupted)
- **Check**: Console logs show "Logo added from: ..."

### Image Quality Issues

**Issue**: Images look blurry or low quality
- **Solution**: Currently using standard quality. You can modify to use HD quality (higher cost) in `imageGenerator.ts`

## Testing

To test image generation:

```bash
npm run generate-post "" STANDARD CALL
```

The system will:
1. Generate post content
2. Generate image with logo
3. Show both in the preview
4. Ask for approval before posting

## Next Steps

1. ✅ Image generation implemented
2. ✅ Logo integration implemented
3. ⏳ Cloud storage upload (needed for GMB API)
4. ⏳ Automatic image URL retrieval
5. ⏳ Image optimization (compression, format conversion)

## Example Generated Image Structure

```
┌─────────────────────────────────────────┐
│                                         │
│  [Generated AI Image - 1200x630]       │
│                                         │
│                              ┌────────┐ │
│                              │ LOGO   │ │ ← Top-right corner
│                              │ 150x150│ │
│                              └────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

