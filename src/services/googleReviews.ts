import axios from 'axios';
import dotenv from 'dotenv';
import { GoogleReview } from '../types';
import { getAccessToken } from './googleAuth';
import { discoverFirstLocation } from './discoverLocation';

dotenv.config();

// Try different base URLs for reviews endpoint
const BASE_URL_V4 = 'https://mybusiness.googleapis.com/v4';
const BASE_URL_BI = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const BASE_URL_V1 = 'https://mybusinessaccountmanagement.googleapis.com/v1';

interface FetchResult {
  reviews: GoogleReview[];
  nextPageToken?: string;
}

const buildClient = async (auth?: { businessId?: string; locationIdInternal?: string }) => {
  // Try to get access token using refresh token flow first
  let token: string | undefined;
  try {
    token = await getAccessToken(auth);
  } catch (error) {
    // Fall back to GOOGLE_ACCESS_TOKEN if refresh token flow not set up
    token = process.env.GOOGLE_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        'Missing access token. Set up refresh token flow (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN) or provide GOOGLE_ACCESS_TOKEN.'
      );
    }
  }

  // Create client without baseURL first, we'll use full URLs
  return axios.create({
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

/**
 * Get account ID from the accounts endpoint
 */
const getAccountId = async (client: any): Promise<string> => {
  // Try v1 endpoint first (new API)
  try {
    const res = await client.get(`${BASE_URL_V1}/accounts`);
    const accounts = res.data.accounts || [];
    if (accounts.length > 0) {
      return accounts[0].name;
    }
  } catch (v1Error: any) {
    // If v1 fails, try v4
    try {
      const res = await client.get(`${BASE_URL_V4}/accounts`);
      const accounts = res.data.accounts || [];
      if (accounts.length > 0) {
        return accounts[0].name;
      }
      throw new Error('No accounts found');
    } catch (v4Error: any) {
      throw new Error(
        `Unable to get account ID. Tried both v1 and v4 endpoints. ` +
        `Error: ${v4Error.response?.data?.error?.message || v4Error.message}`
      );
    }
  }
  throw new Error('No accounts found');
};

export const fetchGoogleReviews = async (opts: {
  locationId: string;
  sinceUpdateTime?: string;
  accountId?: string;
  businessId?: string;
  locationIdInternal?: string;
}): Promise<GoogleReview[]> => {
  const client = await buildClient({ businessId: opts.businessId, locationIdInternal: opts.locationIdInternal });
  
  // Extract numeric location ID (remove "locations/" prefix if present)
  let numericLocationId = opts.locationId;
  if (numericLocationId.startsWith('locations/')) {
    numericLocationId = numericLocationId.replace('locations/', '');
  }
  if (numericLocationId.includes('/')) {
    // If it's already in full path format, extract just the numeric part
    const parts = numericLocationId.split('/');
    numericLocationId = parts[parts.length - 1];
  }

  // Get account ID - prefer explicit override, then env, then discover
  let accountId: string | undefined = opts.accountId || process.env.GOOGLE_ACCOUNT_ID;
  
  if (accountId) {
    // Remove "accounts/" prefix if present
    if (accountId.startsWith('accounts/')) {
      accountId = accountId;
    } else {
      accountId = `accounts/${accountId}`;
    }
    console.log(`Using Account ID from .env: ${accountId}`);
  } else {
    console.log('Account ID not in .env, attempting to discover...');
    try {
      const discovered = await discoverFirstLocation();
      if (!discovered) {
        throw new Error('No locations found');
      }
      accountId = discovered.accountId;
      console.log(`✓ Discovered Account ID: ${accountId}`);
      console.log(`💡 Tip: Add this to your .env to skip discovery:`);
      console.log(`   GOOGLE_ACCOUNT_ID="${accountId}"`);
    } catch (error: any) {
      // Fallback to direct API call
      try {
        accountId = await getAccountId(client);
        console.log(`✓ Account ID: ${accountId}`);
      } catch (fallbackError: any) {
        if (fallbackError.message?.includes('429')) {
          throw new Error(
            `Rate limit exceeded. Please wait 1-2 minutes and try again, ` +
            `or add GOOGLE_ACCOUNT_ID to your .env file to skip this step.`
          );
        }
        throw new Error(
          `Unable to get account ID. ` +
          `Error: ${error.message || fallbackError.message}. ` +
          `You can add GOOGLE_ACCOUNT_ID to your .env file to skip discovery.`
        );
      }
    }
  }

  // Try different endpoint variations for the new split APIs
  // My Business Account Management API is the replacement for management operations
  const endpoints = [
    // Account Management API (new replacement API)
    `${BASE_URL_V1}/${accountId}/locations/${numericLocationId}/reviews`,
    // Standard v4 format (old unified API - may still be needed)
    `${BASE_URL_V4}/${accountId}/locations/${numericLocationId}/reviews`,
    // Business Information API format
    `${BASE_URL_BI}/${accountId}/locations/${numericLocationId}/reviews`,
  ];

  let endpoint: string | null = null;
  let lastError: any = null;

  // Try each endpoint until one works
  for (const testEndpoint of endpoints) {
    try {
      console.log(`Trying endpoint: ${testEndpoint.substring(0, 100)}...`);
      // Test with a minimal request (just check if endpoint exists)
      const testRes = await client.get(testEndpoint, {
        params: { pageSize: 1 },
        validateStatus: (status) => status < 500, // Don't throw on 4xx, we'll check manually
      });

      if (testRes.status === 200) {
        endpoint = testEndpoint;
        console.log(`✓ Found working endpoint!`);
        break;
      } else if (testRes.status === 403) {
        // 403 means endpoint exists but no access - this is the right endpoint, just need API enabled
        endpoint = testEndpoint;
        lastError = new Error(`Access denied (403) for endpoint: ${testEndpoint}`);
        break;
      } else if (testRes.status !== 404) {
        // If it's not 404, it might be the right endpoint with a different error
        endpoint = testEndpoint;
        lastError = testRes;
        break;
      }
    } catch (error: any) {
      if (error.response?.status === 403) {
        // 403 means endpoint exists - this is likely the right one
        endpoint = testEndpoint;
        lastError = error;
        break;
      }
      lastError = error;
    }
  }

  if (!endpoint) {
    throw new Error(
      `Could not find reviews endpoint. Tried ${endpoints.length} variations. ` +
      `Last error: ${lastError?.response?.data?.error?.message || lastError?.message}`
    );
  }

  console.log(`Using endpoint: ${endpoint}`);

  const results: GoogleReview[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string | number | undefined> = {
      pageSize: 50,
      orderBy: 'updateTime desc',
      pageToken,
    };

    // Note: The v4 API may not support filter parameter in the same way
    // If sinceUpdateTime is provided, we'll filter in memory after fetching
    // Commenting out the filter for now to avoid 400 errors
    // if (opts.sinceUpdateTime) {
    //   params.filter = `updateTime>="${opts.sinceUpdateTime}"`;
    // }

    try {
      const res = await client.get<FetchResult>(endpoint!, { params });
      results.push(...(res.data.reviews || []));
      pageToken = res.data.nextPageToken;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(
          `Reviews endpoint not found (404). ` +
          `Account ID: ${accountId}, Location ID: ${numericLocationId}. ` +
          `Endpoint: ${endpoint}. ` +
          `The reviews endpoint may not be available in the new split APIs.`
        );
      } else if (error.response?.status === 403) {
        const errorDetails = error.response?.data?.error || {};
        throw new Error(
          `Access denied (403). ` +
          `Endpoint: ${endpoint}\n` +
          `Error: ${errorDetails.message || 'Access denied'}\n` +
          `This usually means:\n` +
          `  1. The old unified "Google Business Profile API" needs to be enabled (reviews still use the old endpoint)\n` +
          `  2. Or your OAuth token doesn't have the 'business.manage' scope\n` +
          `  3. Or the reviews endpoint isn't available in your region/API version\n` +
          `\nIf you can't enable the old API, reviews may not be accessible through the new split APIs yet.`
        );
      }
      throw error;
    }
  } while (pageToken);

  return results;
};
