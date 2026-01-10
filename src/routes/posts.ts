import express from 'express';
import { createLocalPost, listLocalPosts } from '../services/googlePosts';
import { generateSEOPost } from '../services/seoPostGenerator';
import { generateSmartPost } from '../services/smartPostGenerator';

const router = express.Router();

// Create a new SEO-optimized post
router.post('/', async (req, res) => {
  try {
    const { topic, postType, callToAction, ctaUrl } = req.body;
    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';

    if (!accountId || !locationId) {
      return res.status(400).json({ error: 'Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID' });
    }

    // Generate SEO-optimized content
    const postContent = await generateSEOPost({
      topic: topic || 'General dental care and practice information',
      postType: postType || 'STANDARD',
      callToAction: callToAction || 'LEARN_MORE',
      ctaUrl: ctaUrl || process.env.WEBSITE_URL || 'https://malama.dental',
    });

    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;

    // Create the post
    const response = await createLocalPost({
      accountId,
      locationId: numericLocationId,
      post: {
        languageCode: 'en-US',
        summary: postContent.summary,
        callToAction: postContent.callToAction,
        topicType: postContent.topicType,
      },
    });

    res.json({
      success: true,
      post: response,
      content: postContent,
    });
  } catch (err: any) {
    console.error('Failed to create post', err);
    res.status(500).json({ error: err.message || 'Failed to create post' });
  }
});

// Generate a post (without posting)
router.post('/generate', async (req, res) => {
  try {
    const { topic, postType, callToAction, useWeeklyReport = true } = req.query;

    const result = await generateSmartPost({
      topic: topic as string,
      postType: (postType as any) || 'STANDARD',
      callToAction: (callToAction as any) || 'LEARN_MORE',
      ctaUrl: process.env.WEBSITE_URL || 'https://malama.dental',
      useWeeklyReport: useWeeklyReport !== 'false',
      maxPosts: 1,
    });

    if (result.posts.length === 0) {
      return res.status(500).json({ error: 'Failed to generate post' });
    }

    const postContent = result.posts[0];
    res.json({
      ...postContent,
      keywords: result.keywords,
      source: result.source,
    });
  } catch (err: any) {
    console.error('Failed to generate post', err);
    res.status(500).json({ error: err.message || 'Failed to generate post' });
  }
});

// Create a post (post to GMB)
router.post('/create', async (req, res) => {
  try {
    const { summary, postType, callToAction, media } = req.body;
    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';

    if (!accountId || !locationId) {
      return res.status(400).json({ error: 'Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID' });
    }

    if (!summary) {
      return res.status(400).json({ error: 'Post summary is required' });
    }

    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;
    const accountIdClean = accountId.replace(/^accounts\//, '');

    const response = await createLocalPost({
      accountId: accountIdClean,
      locationId: numericLocationId,
      post: {
        languageCode: 'en-US',
        summary,
        callToAction,
        topicType: postType,
        media,
      },
    });

    res.json({
      success: true,
      post: response,
    });
  } catch (err: any) {
    console.error('Failed to create post', err);
    res.status(500).json({ error: err.message || 'Failed to create post' });
  }
});

// List all posts
router.get('/', async (req, res) => {
  try {
    const accountId = process.env.GOOGLE_ACCOUNT_ID || '';
    const locationId = process.env.GOOGLE_LOCATION_ID || '';

    if (!accountId || !locationId) {
      return res.status(400).json({ error: 'Missing GOOGLE_ACCOUNT_ID or GOOGLE_LOCATION_ID' });
    }

    const numericLocationId = locationId.startsWith('locations/')
      ? locationId.split('/')[1]
      : locationId;
    const accountIdClean = accountId.replace(/^accounts\//, '');

    const posts = await listLocalPosts({
      accountId: accountIdClean,
      locationId: numericLocationId,
    });

    res.json(posts);
  } catch (err: any) {
    console.error('Failed to list posts', err);
    res.status(500).json({ error: err.message || 'Failed to list posts' });
  }
});

export default router;

