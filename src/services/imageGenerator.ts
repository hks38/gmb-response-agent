import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import * as https from 'https';
import * as http from 'http';
import { llmService } from './llmService';
import { getBusinessConfig } from './businessConfig';
import dotenv from 'dotenv';

dotenv.config();

export interface ImageGenerationOptions {
  topic: string;
  keywords: string[];
  businessName: string;
}

export interface GeneratedImage {
  imagePath: string;
  imageUrl?: string;
  width: number;
  height: number;
}

/**
 * Generate an image for a GMB post based on the topic
 * Uses DALL-E or similar service to generate, then adds business logo
 */
export const generatePostImage = async (
  options: ImageGenerationOptions
): Promise<GeneratedImage> => {
  const { topic, keywords, businessName } = options;

  console.log('🎨 Generating image for post...');
  console.log(`   Topic: ${topic}`);
  console.log(`   Keywords: ${keywords.join(', ')}`);

  try {
    // Step 1: Generate image prompt using LLM
    const imagePrompt = await generateImagePrompt(topic, keywords, businessName);
    console.log(`   ✓ Image prompt generated`);

    // Step 2: Generate image using DALL-E
    const generatedImagePath = await generateImageWithDALLE(imagePrompt);
    console.log(`   ✓ Image generated`);

    // Step 3: Add business logo to the image
    const finalImagePath = await addLogoToImage(generatedImagePath, businessName);
    console.log(`   ✓ Logo added to image`);

    // Step 4: Upload image (if needed) or return local path
    // For now, return local path - will need to upload to get public URL
    const stats = await fs.stat(finalImagePath);
    
    return {
      imagePath: finalImagePath,
      width: 1200, // Standard banner width
      height: 630, // Standard banner height (social media ratio)
    };
  } catch (error: any) {
    console.error(`   ❌ Failed to generate image: ${error.message}`);
    throw error;
  }
};

/**
 * Generate an optimized image prompt using LLM
 */
const generateImagePrompt = async (
  topic: string,
  keywords: string[],
  businessName: string
): Promise<string> => {
  const prompt = `You are a creative director designing an image for a dental practice social media post.

Topic: ${topic}
Keywords: ${keywords.join(', ')}
Business: ${businessName}

Create a detailed, visually appealing image prompt for DALL-E that will:
1. Be suitable for a dental practice post (professional, clean, welcoming)
2. Relate to the topic: "${topic}"
3. Be appropriate for a Google Business Profile post
4. Use warm, professional colors
5. Be suitable for a horizontal banner format (1200x630 pixels)
6. Leave space in the top right corner for a logo overlay

The image should be:
- Clean and professional
- Bright and welcoming
- Relevant to dental care and oral health
- Suitable for all ages

Return ONLY the image prompt text (no explanations, no JSON, just the prompt).`;

  try {
    const response = await llmService.generate({
      prompt,
      responseFormat: 'text',
    });

    return response.content.trim();
  } catch (error: any) {
    // Fallback prompt if LLM fails
    return `Professional dental office interior, bright and clean, warm natural lighting, modern dental equipment, welcoming atmosphere, soft blue and white color scheme, horizontal banner format, space in top right corner for logo`;
  }
};

/**
 * Generate image using OpenAI DALL-E
 */
const generateImageWithDALLE = async (prompt: string): Promise<string> => {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not set. Image generation requires OpenAI API key.');
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024', // DALL-E 3 supports 1024x1024, 1792x1024, or 1024x1792
        quality: 'standard',
        response_format: 'url',
      },
      {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const imageUrl = response.data.data[0].url;
    console.log(`   📥 Downloading generated image...`);

    // Download the image
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });

    // Save to temporary file
    const imagesDir = path.join(process.cwd(), 'data', 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    const tempImagePath = path.join(imagesDir, `generated-${Date.now()}.png`);
    await fs.writeFile(tempImagePath, imageResponse.data);

    return tempImagePath;
  } catch (error: any) {
    if (error.response) {
      throw new Error(`DALL-E API error: ${error.response.status} - ${error.response.data?.error?.message || error.message}`);
    }
    throw new Error(`Failed to generate image with DALL-E: ${error.message}`);
  }
};

/**
 * Add business logo to the generated image using Sharp
 */
const addLogoToImage = async (
  imagePath: string,
  businessName: string
): Promise<string> => {
  try {
    // Resize base image to banner dimensions (1200x630) and fit/cover
    const baseImage = sharp(imagePath)
      .resize(1200, 630, {
        fit: 'cover',
        position: 'center',
      });

    // Try to load logo, if available
    const logoPath = await findLogoFile();
    
    if (logoPath) {
      try {
        // Resize logo
        const logoSize = 150;
        const logo = await sharp(logoPath)
          .resize(logoSize, logoSize, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 }
          })
          .png()
          .toBuffer();

        // Create white background for logo (with padding)
        const padding = 20;
        const logoBg = await sharp({
          create: {
            width: logoSize + (padding * 2),
            height: logoSize + (padding * 2),
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 0.9 }
          }
        })
        .png()
        .toBuffer();

        // Composite: base image + logo background + logo
        const finalImage = await baseImage
          .composite([
            {
              input: logoBg,
              top: padding,
              left: 1200 - logoSize - (padding * 2),
            },
            {
              input: logo,
              top: padding * 2,
              left: 1200 - logoSize - padding,
            }
          ])
          .png()
          .toBuffer();

        // Save the final image
        const imagesDir = path.join(process.cwd(), 'data', 'images');
        await fs.mkdir(imagesDir, { recursive: true });

        const finalImagePath = path.join(imagesDir, `post-banner-${Date.now()}.png`);
        await fs.writeFile(finalImagePath, finalImage);

        console.log(`   ✓ Logo added from: ${logoPath}`);
        return finalImagePath;
      } catch (logoError: any) {
        console.warn(`   ⚠️  Could not load logo: ${logoError.message}`);
        // Continue without logo - just resize base image
      }
    }

    // If no logo, just resize and save base image
    const imagesDir = path.join(process.cwd(), 'data', 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    const finalImagePath = path.join(imagesDir, `post-banner-${Date.now()}.png`);
    await baseImage.png().toFile(finalImagePath);

    return finalImagePath;
  } catch (error: any) {
    throw new Error(`Failed to add logo to image: ${error.message}`);
  }
};

/**
 * Find logo file in common locations
 */
const findLogoFile = async (): Promise<string | null> => {
  const possiblePaths = [
    path.join(process.cwd(), 'assets', 'logo.png'),
    path.join(process.cwd(), 'assets', 'logo.jpg'),
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'public', 'logo.jpg'),
    path.join(process.cwd(), 'data', 'logo.png'),
    path.join(process.cwd(), 'data', 'logo.jpg'),
    path.join(process.cwd(), 'logo.png'),
    path.join(process.cwd(), 'logo.jpg'),
  ];

  for (const logoPath of possiblePaths) {
    try {
      await fs.access(logoPath);
      return logoPath;
    } catch {
      // Continue to next path
    }
  }

  return null;
};


/**
 * Upload image to get public URL (optional - for cloud storage)
 * For now, we'll use local path and let GMB API handle upload
 */
export const uploadImageForGMB = async (imagePath: string): Promise<string> => {
  // For now, return the local path
  // In production, you'd upload to Google Cloud Storage or similar
  // and return the public URL
  
  // TODO: Implement cloud storage upload if needed
  // For GMB, we can use the local file path if serving from a public endpoint
  // or upload directly via the API if it supports file uploads
  
  return imagePath;
};

