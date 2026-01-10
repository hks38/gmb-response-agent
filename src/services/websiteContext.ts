import { fetchWebsiteContent, PracticeInfo } from './websiteScraper';
import * as fs from 'fs/promises';
import * as path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'data', 'website-context.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedContext {
  practiceInfo: PracticeInfo;
  fetchedAt: number;
}

let cachedContext: CachedContext | null = null;

export const getWebsiteContext = async (websiteUrl?: string): Promise<PracticeInfo> => {
  const url = websiteUrl || process.env.WEBSITE_URL || 'https://malama.dental';

  // Check in-memory cache first
  if (cachedContext && Date.now() - cachedContext.fetchedAt < CACHE_TTL_MS) {
    return cachedContext.practiceInfo;
  }

  // Check file cache
  try {
    const fileContent = await fs.readFile(CACHE_FILE, 'utf-8');
    const cached: CachedContext = JSON.parse(fileContent);
    if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      cachedContext = cached;
      return cached.practiceInfo;
    }
  } catch (error) {
    // Cache file doesn't exist or is invalid, fetch fresh
  }

  // Fetch fresh content
  console.log(`Fetching website context from ${url}...`);
  const practiceInfo = await fetchWebsiteContent(url);

  // Update cache
  cachedContext = {
    practiceInfo,
    fetchedAt: Date.now(),
  };

  // Save to file
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cachedContext, null, 2));
  } catch (error) {
    console.warn('Failed to save website context cache:', error);
  }

  return practiceInfo;
};

export const formatWebsiteContextForPrompt = (practiceInfo: PracticeInfo): string => {
  const parts: string[] = [];

  parts.push(`Practice: Malama Dental`); // Always use Malama Dental
  if (practiceInfo.location) {
    parts.push(`Location: ${practiceInfo.location}`);
  }
  if (practiceInfo.phone) {
    parts.push(`Phone: ${practiceInfo.phone}`);
  }
  if (practiceInfo.email) {
    parts.push(`Email: ${practiceInfo.email}`);
  }
  if (practiceInfo.address) {
    parts.push(`Address: ${practiceInfo.address}`);
  }

  if (practiceInfo.description) {
    parts.push(`\nAbout: ${practiceInfo.description}`);
  }

  if (practiceInfo.services.length > 0) {
    parts.push(`\nServices offered: ${practiceInfo.services.join(', ')}`);
  }

  if (practiceInfo.unique_selling_points.length > 0) {
    parts.push(
      `\nKey features: ${practiceInfo.unique_selling_points.join(', ')}`
    );
  }

  return parts.join('\n');
};

