import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import { prisma } from '../db/client';
import { decryptString, encryptString } from './encryption';
import { getDefaultBusinessId, getDefaultLocationId } from './tenantDefaults';

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

const TOKEN_FILE = path.join(process.cwd(), 'data', 'google-tokens.json');

let oauth2Client: OAuth2Client | null = null;
let cachedToken: TokenData | null = null;
const cachedByTenant = new Map<string, TokenData>(); // key = `${businessId}:${locationIdInternal}`

const getOAuth2Client = (): OAuth2Client => {
  if (oauth2Client) {
    return oauth2Client;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }

  oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  return oauth2Client;
};

export const loadTokens = async (): Promise<TokenData | null> => {
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

const loadTokensFromDb = async (opts: {
  businessId: string;
  locationIdInternal: string;
}): Promise<TokenData | null> => {
  const key = `${opts.businessId}:${opts.locationIdInternal}`;
  const cached = cachedByTenant.get(key);
  if (cached) return cached;

  const row = await prisma.googleCredential.findFirst({
    where: { businessId: opts.businessId, locationId: opts.locationIdInternal, provider: 'google_gbp' },
  });
  if (!row) return null;

  const refresh_token = decryptString(row.refreshTokenEnc);
  const access_token = row.accessTokenEnc ? decryptString(row.accessTokenEnc) : '';
  const expiry_date = row.expiryDate ? row.expiryDate.getTime() : undefined;
  const token: TokenData = { access_token, refresh_token, expiry_date };
  cachedByTenant.set(key, token);
  return token;
};

const saveTokensToDb = async (opts: {
  businessId: string;
  locationIdInternal: string;
  tokens: TokenData;
}): Promise<void> => {
  const key = `${opts.businessId}:${opts.locationIdInternal}`;
  cachedByTenant.set(key, opts.tokens);

  if (!opts.tokens.refresh_token) {
    throw new Error('Cannot persist Google tokens without a refresh_token');
  }

  await prisma.googleCredential.upsert({
    where: { locationId_provider: { locationId: opts.locationIdInternal, provider: 'google_gbp' } },
    create: {
      businessId: opts.businessId,
      locationId: opts.locationIdInternal,
      provider: 'google_gbp',
      refreshTokenEnc: encryptString(opts.tokens.refresh_token),
      accessTokenEnc: opts.tokens.access_token ? encryptString(opts.tokens.access_token) : null,
      expiryDate: opts.tokens.expiry_date ? new Date(opts.tokens.expiry_date) : null,
    },
    update: {
      businessId: opts.businessId,
      refreshTokenEnc: encryptString(opts.tokens.refresh_token),
      accessTokenEnc: opts.tokens.access_token ? encryptString(opts.tokens.access_token) : null,
      expiryDate: opts.tokens.expiry_date ? new Date(opts.tokens.expiry_date) : null,
    },
  });
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
export const getAccessToken = async (opts?: {
  businessId?: string;
  locationIdInternal?: string;
}): Promise<string> => {
  const client = getOAuth2Client();

  const businessId = opts?.businessId || (await getDefaultBusinessId());
  const locationIdInternal = opts?.locationIdInternal || (await getDefaultLocationId());
  const tenantKey = `${businessId}:${locationIdInternal}`;

  // Prefer DB tokens if available (multi-tenant)
  let tokens = await loadTokensFromDb({ businessId, locationIdInternal });

  // Fall back to legacy file/env tokens if DB credential not present
  if (!tokens) {
    tokens = await loadTokens();
  }

  // If no tokens or no refresh token in file, check env (for initial setup or if file token is invalid)
  const envRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  
  // Prefer refresh token from file, but fall back to env if file doesn't have one
  if (!tokens || !tokens.refresh_token) {
    if (envRefreshToken) {
      tokens = {
        access_token: '', // Will be refreshed
        refresh_token: envRefreshToken,
      };
      console.log('Using refresh token from environment variable');
    } else {
      throw new Error(
        'No refresh token found in file or environment. Run the OAuth flow to get a refresh token:\n' +
        '  npm run get-refresh-token\n' +
        'See GOOGLE_BUSINESS_PROFILE_SETUP.md Option B for details.'
      );
    }
  } else if (envRefreshToken && tokens.refresh_token !== envRefreshToken) {
    // If both exist and are different, use the one from env (might be more recent)
    console.log('Warning: Refresh token in file differs from env. Using env token.');
    tokens.refresh_token = envRefreshToken;
  }

  // Check if we need to refresh
  if (!tokens.access_token || isTokenExpired(tokens)) {
    if (!tokens.refresh_token) {
      throw new Error(
        'Access token expired and no refresh token available. Re-run the OAuth flow.'
      );
    }

    console.log('Refreshing access token...');
    try {
      // Ensure refresh token is available
      if (!tokens.refresh_token) {
        throw new Error('No refresh token available for refresh');
      }

      client.setCredentials({
        refresh_token: tokens.refresh_token,
      });

      const { credentials } = await client.refreshAccessToken();

      // Validate the response
      if (!credentials || !credentials.access_token) {
        throw new Error(
          'Refresh token returned no access token. The refresh token may be invalid or revoked. ' +
          'Please re-run OAuth flow: npm run get-refresh-token'
        );
      }

      // Check token length (access tokens are typically long strings)
      if (credentials.access_token.length < 50) {
        throw new Error(
          'Received invalid access token (too short). Refresh token may be expired. ' +
          'Please re-run OAuth flow: npm run get-refresh-token'
        );
      }

      tokens = {
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        expiry_date: credentials.expiry_date || undefined,
      };

      // Persist: if we loaded from DB, keep using DB; otherwise persist to legacy file.
      if (cachedByTenant.has(tenantKey) || opts?.businessId || opts?.locationIdInternal) {
        await saveTokensToDb({ businessId, locationIdInternal, tokens });
      } else {
        await saveTokens(tokens);
        cachedToken = tokens; // Update cache
      }
      console.log('✓ Access token refreshed successfully (expires at:', 
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'unknown', ')');
    } catch (refreshError: any) {
      // Clear cached tokens on refresh failure
      cachedToken = null;
      cachedByTenant.delete(tenantKey);
      
      const errorMessage = refreshError.message || 'Unknown error';
      const errorCode = refreshError.code;
      
      // Handle specific OAuth errors
      if (errorMessage.includes('invalid_grant') || errorCode === 'invalid_grant') {
        throw new Error(
          'Refresh token is invalid or expired. Please re-run the OAuth flow:\n' +
          '  npm run get-refresh-token\n' +
          `Error: ${errorMessage}`
        );
      }
      
      if (errorMessage.includes('invalid_client') || errorCode === 'invalid_client') {
        throw new Error(
          'Invalid OAuth client credentials. Please check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env\n' +
          `Error: ${errorMessage}`
        );
      }
      
      // Log the full error for debugging
      console.error('Token refresh error details:', {
        message: errorMessage,
        code: errorCode,
        response: refreshError.response?.data,
      });
      
      throw new Error(
        `Failed to refresh access token: ${errorMessage}. ` +
        'Please verify your GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET in .env'
      );
    }
  }

  if (!tokens.access_token) {
    throw new Error('No valid access token available after refresh attempt.');
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
 * @param state Optional state parameter (e.g., businessId for multi-tenant)
 */
export const getAuthUrl = (state?: string): string => {
  const client = getOAuth2Client();
  const scopes = ['https://www.googleapis.com/auth/business.manage'];

  return client.generateAuthUrl({
    access_type: 'offline', // Required to get refresh token
    scope: scopes,
    prompt: 'consent', // Force consent screen to get refresh token
    state: state, // Pass through state (e.g., businessId) for callback
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

  return tokenData;
};

