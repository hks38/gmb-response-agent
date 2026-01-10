import dotenv from 'dotenv';
import axios from 'axios';
import { getAccessToken } from '../src/services/googleAuth';

dotenv.config();

// Try the new API endpoint first (My Business Account Management API)
const BASE_URL_V1 = 'https://mybusinessaccountmanagement.googleapis.com/v1';
// Fallback to old endpoint
const BASE_URL_V4 = 'https://mybusiness.googleapis.com/v4';

const getAccessTokenForAPI = async (): Promise<string> => {
  // Try refresh token flow first
  try {
    return await getAccessToken();
  } catch (error) {
    // Fall back to direct access token
    const token = process.env.GOOGLE_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        'No access token available. Set up refresh token flow (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN) or provide GOOGLE_ACCESS_TOKEN.'
      );
    }
    return token;
  }
};

const main = async () => {
  console.log('='.repeat(80));
  console.log('Get Google Business Profile Location ID');
  console.log('='.repeat(80));
  console.log();

  try {
    // Get access token
    console.log('Getting access token...');
    const token = await getAccessTokenForAPI();
    console.log('✓ Access token obtained\n');

    // Get accounts - try new API first, then fallback to old
    console.log('Fetching accounts from Google Business Profile API...');
    let accounts: any[] = [];
    let baseUrl = BASE_URL_V1;
    
    // Try new API endpoint first
    try {
      const accountsRes = await axios.get(`${BASE_URL_V1}/accounts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      accounts = accountsRes.data.accounts || [];
      baseUrl = BASE_URL_V1;
      console.log('✓ Using My Business Account Management API (v1)\n');
    } catch (error: any) {
      // If 404, try old endpoint
      if (error.response?.status === 404) {
        console.log('New API endpoint not found, trying old endpoint...');
        try {
          const accountsRes = await axios.get(`${BASE_URL_V4}/accounts`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          accounts = accountsRes.data.accounts || [];
          baseUrl = BASE_URL_V4;
          console.log('✓ Using My Business API (v4)\n');
        } catch (v4Error: any) {
          // Re-throw the v4 error
          throw v4Error;
        }
      } else {
        // Re-throw other errors (429, 401, etc.)
        throw error;
      }
    }

    if (accounts.length === 0) {
      console.log('No accounts found.');
      process.exit(1);
    }

    console.log(`✓ Found ${accounts.length} account(s):\n`);
    accounts.forEach((account: any, index: number) => {
      console.log(`${index + 1}. ${account.name} (${account.accountName || 'No name'})`);
    });

    // Get locations for each account
    console.log('\n' + '='.repeat(80));
    console.log('Fetching locations...\n');

    for (const account of accounts) {
      const accountId = account.name;
      console.log(`Account: ${accountId}`);

      try {
        // Use the same base URL that worked for accounts
        const locationsUrl = baseUrl === BASE_URL_V1 
          ? `${BASE_URL_V1}/${accountId}/locations`
          : `${BASE_URL_V4}/${accountId}/locations`;
          
        const locationsRes = await axios.get(locationsUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const accountLocations = locationsRes.data.locations || [];
        if (accountLocations.length === 0) {
          console.log('  No locations found.\n');
          continue;
        }

        console.log(`  Found ${accountLocations.length} location(s):\n`);
        accountLocations.forEach((location: any) => {
          console.log(`  📍 Location ID: ${location.name}`);
          console.log(`     Name: ${location.title || location.storefrontAddress?.addressLines?.[0] || 'N/A'}`);
          if (location.storefrontAddress) {
            const addr = location.storefrontAddress;
            const addressParts = [
              addr.addressLines?.[0],
              addr.locality,
              addr.administrativeArea,
              addr.postalCode,
            ].filter(Boolean);
            if (addressParts.length > 0) {
              console.log(`     Address: ${addressParts.join(', ')}`);
            }
          }
          console.log();
        });
      } catch (error: any) {
        console.error(`  ✗ Error fetching locations: ${error.response?.data?.error?.message || error.message}\n`);
      }
    }

    console.log('='.repeat(80));
    console.log('\nCopy the Location ID (format: locations/1234567890) to your .env file:');
    console.log('GOOGLE_LOCATION_ID="locations/1234567890"');
    console.log('\nIf you see an Account ID, you can also add:');
    console.log('GOOGLE_ACCOUNT_ID="accounts/123456"');
  } catch (error: any) {
    console.error('\n✗ Error:', error.message);
    
    if (error.response?.status === 429) {
      console.error('\nRate limit exceeded. Wait 1-2 minutes and try again.');
    } else if (error.response?.status === 404) {
      console.error('\nAPI endpoint not found. Make sure you enabled:');
      console.error('  - My Business Account Management API');
      console.error('  - My Business Business Information API');
    } else if (error.response?.status === 401) {
      console.error('\nUnauthorized. Check your access token or refresh token.');
    } else if (error.response?.data) {
      console.error('\nResponse:', JSON.stringify(error.response.data, null, 2).substring(0, 500));
    }
    
    process.exit(1);
  }
};

main();
