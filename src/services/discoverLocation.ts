import axios from 'axios';
import { getAccessToken } from './googleAuth';

const BASE_URL_V1 = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BASE_URL_V4 = 'https://mybusiness.googleapis.com/v4';

export interface DiscoveredLocation {
  accountId: string;
  locationId: string;
  locationName?: string;
  address?: string;
}

/**
 * Automatically discover the first available location ID
 */
export const discoverFirstLocation = async (): Promise<DiscoveredLocation | null> => {
  const token = await getAccessToken();
  let baseUrl = BASE_URL_V1;

  // Try to get accounts
  let accounts: any[] = [];

  try {
    const accountsRes = await axios.get(`${BASE_URL_V1}/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    accounts = accountsRes.data.accounts || [];
    baseUrl = BASE_URL_V1;
  } catch (error: any) {
    if (error.response?.status === 404) {
      // Try old endpoint
      try {
        const accountsRes = await axios.get(`${BASE_URL_V4}/accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        accounts = accountsRes.data.accounts || [];
        baseUrl = BASE_URL_V4;
      } catch (v4Error) {
        throw new Error('Unable to fetch accounts. Make sure APIs are enabled.');
      }
    } else {
      throw error;
    }
  }

  if (accounts.length === 0) {
    return null;
  }

  // Get the first account
  const account = accounts[0];
  const accountId = account.name;

  // Get locations for this account
  try {
    const locationsUrl =
      baseUrl === BASE_URL_V1
        ? `${BASE_URL_V1}/${accountId}/locations`
        : `${BASE_URL_V4}/${accountId}/locations`;

    const locationsRes = await axios.get(locationsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const locations = locationsRes.data.locations || [];
    if (locations.length === 0) {
      return null;
    }

    // Return the first location
    const location = locations[0];
    const locationId = location.name;

    return {
      accountId,
      locationId,
      locationName: location.title || location.storefrontAddress?.addressLines?.[0],
      address: location.storefrontAddress
        ? [
            location.storefrontAddress.addressLines?.[0],
            location.storefrontAddress.locality,
            location.storefrontAddress.administrativeArea,
            location.storefrontAddress.postalCode,
          ]
            .filter(Boolean)
            .join(', ')
        : undefined,
    };
  } catch (error: any) {
    throw new Error(`Unable to fetch locations: ${error.response?.data?.error?.message || error.message}`);
  }
};

