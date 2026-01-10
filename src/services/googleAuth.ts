import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

const TOKEN_FILE = path.join(process.cwd(), 'data', 'google-tokens.json');

let oauth2Client: OAuth2Client | null = null;
let cachedToken: TokenData | null = null;

const getOAuth2Client = (): OAuth2Client => {
  if (oauth2Client) {
    return oauth2Client;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }

  oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  return oauth2Client;
};

const loadTokens = async (): Promise<TokenData | null> => {
  // Check in-memory cache first
  if (cachedToken) {
    return cachedToken;
  }

  try {
    const fileContent = await fs.readFile(TOKEN_FILE, 'utf-8');
    const tokens: TokenData = JSON.parse(fileContent);
    cachedToken = tokens;
    return tokens;
  } catch (error) {
    // File doesn't exist or is invalid
    return null;
  }
};

const saveTokens = async (tokens: TokenData): Promise<void> => {
  cachedToken = tokens;
  try {
    await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
    await fs.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  } catch (error) {
    console.warn('Failed to save tokens to file:', error);
  }
};

const isTokenExpired = (token: TokenData): boolean => {
  if (!token.expiry_date) {
    return true; // Assume expired if no expiry date
  }
  // Refresh if token expires in less than 5 minutes
  return Date.now() >= token.expiry_date - 5 * 60 * 1000;
};

/**
 * Get a valid access token, refreshing if necessary
 */
export const getAccessToken = async (): Promise<string> => {
  const client = getOAuth2Client();

  // Try to load saved tokens
  let tokens = await loadTokens();

  // If no tokens, check if we have a refresh token in env (for initial setup)
  if (!tokens || !tokens.refresh_token) {
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (refreshToken) {
      tokens = {
        access_token: '', // Will be refreshed
        refresh_token: refreshToken,
      };
    } else {
      throw new Error(
        'No tokens found. Run the OAuth flow to get a refresh token. See GOOGLE_BUSINESS_PROFILE_SETUP.md Option B.'
      );
    }
  }

  // Check if we need to refresh
  if (!tokens.access_token || isTokenExpired(tokens)) {
    if (!tokens.refresh_token) {
      throw new Error(
        'Access token expired and no refresh token available. Re-run the OAuth flow.'
      );
    }

    console.log('Refreshing access token...');
    client.setCredentials({
      refresh_token: tokens.refresh_token,
    });

    const { credentials } = await client.refreshAccessToken();

    tokens = {
      access_token: credentials.access_token || '',
      refresh_token: credentials.refresh_token || tokens.refresh_token,
      expiry_date: credentials.expiry_date || undefined,
    };

    await saveTokens(tokens);
    console.log('Access token refreshed successfully');
  }

  return tokens.access_token;
};

/**
 * Save tokens from OAuth callback
 */
export const saveTokensFromCallback = async (tokens: TokenData): Promise<void> => {
  await saveTokens(tokens);
};

/**
 * Generate OAuth authorization URL
 */
export const getAuthUrl = (): string => {
  const client = getOAuth2Client();
  const scopes = ['https://www.googleapis.com/auth/business.manage'];

  return client.generateAuthUrl({
    access_type: 'offline', // Required to get refresh token
    scope: scopes,
    prompt: 'consent', // Force consent screen to get refresh token
  });
};

/**
 * Exchange authorization code for tokens
 */
export const getTokensFromCode = async (code: string): Promise<TokenData> => {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  const tokenData: TokenData = {
    access_token: tokens.access_token || '',
    refresh_token: tokens.refresh_token || undefined,
    expiry_date: tokens.expiry_date || undefined,
  };

  await saveTokens(tokenData);
  return tokenData;
};

