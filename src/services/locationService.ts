import axios from 'axios';
import dotenv from 'dotenv';
import { getAccessToken } from './googleAuth';

dotenv.config();

const BASE_URL_BI = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const BASE_URL_V4 = 'https://mybusiness.googleapis.com/v4';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

/**
 * Get location details including coordinates from Google Business Profile
 */
export const getLocationDetails = async (params: {
  accountId: string;
  locationId: string;
}): Promise<LocationCoordinates> => {
  const client = await buildClient();
  
  // Extract numeric location ID (handle various formats)
  let numericLocationId = params.locationId;
  if (numericLocationId.startsWith('locations/')) {
    numericLocationId = numericLocationId.replace('locations/', '');
  }
  if (numericLocationId.includes('/')) {
    const parts = numericLocationId.split('/');
    numericLocationId = parts[parts.length - 1];
  }

  // Handle account ID format
  let accountIdClean = params.accountId;
  if (accountIdClean.startsWith('accounts/')) {
    accountIdClean = accountIdClean.replace('accounts/', '');
  }

  // Try Business Information API first
  let endpoint = `${BASE_URL_BI}/accounts/${accountIdClean}/locations/${numericLocationId}`;
  
  try {
    const response = await client.get(endpoint, {
      params: {
        readMask: 'storefrontAddress.latlng,storefrontAddress.addressLines,storefrontAddress.locality,storefrontAddress.administrativeArea,storefrontAddress.postalCode',
      },
    });
    const location = response.data;
    
    // Extract coordinates from storefrontAddress
    if (location.storefrontAddress?.latlng) {
      const latlng = location.storefrontAddress.latlng;
      return {
        latitude: latlng.latitude || 0,
        longitude: latlng.longitude || 0,
        address: location.storefrontAddress?.addressLines?.join(', '),
        city: location.storefrontAddress?.locality,
        state: location.storefrontAddress?.administrativeArea,
        zipCode: location.storefrontAddress?.postalCode,
      };
    }

    // If coordinates not available, try to use address or fallback
    if (location.storefrontAddress?.addressLines) {
      // Return with 0,0 coordinates - caller can handle geocoding if needed
      return {
        latitude: 0,
        longitude: 0,
        address: location.storefrontAddress.addressLines.join(', '),
        city: location.storefrontAddress?.locality,
        state: location.storefrontAddress?.administrativeArea,
        zipCode: location.storefrontAddress?.postalCode,
      };
    }

    throw new Error('Location coordinates not found in API response');
  } catch (error: any) {
    // Fallback to v4 API
    if (error.response?.status === 404 || error.response?.status === 400) {
      endpoint = `${BASE_URL_V4}/accounts/${accountIdClean}/locations/${numericLocationId}`;
      try {
        const response = await client.get(endpoint);
        const location = response.data;
        
        if (location.storefrontAddress?.latlng) {
          const latlng = location.storefrontAddress.latlng;
          return {
            latitude: latlng.latitude || 0,
            longitude: latlng.longitude || 0,
            address: location.storefrontAddress?.addressLines?.join(', '),
            city: location.storefrontAddress?.locality,
            state: location.storefrontAddress?.administrativeArea,
            zipCode: location.storefrontAddress?.postalCode,
          };
        }

        // Fallback to using address from name if available
        if (location.storefrontAddress?.addressLines) {
          return {
            latitude: 0,
            longitude: 0,
            address: location.storefrontAddress.addressLines.join(', '),
            city: location.storefrontAddress?.locality,
            state: location.storefrontAddress?.administrativeArea,
            zipCode: location.storefrontAddress?.postalCode,
          };
        }

        throw new Error('Location coordinates not found in v4 API response');
      } catch (v4Error: any) {
        // If both APIs fail, try to use a known location or fallback
        // For now, use Long Valley, NJ as default (can be improved with geocoding)
        console.warn(`⚠️  Could not fetch location coordinates from API, using fallback`);
        return {
          latitude: 40.7879, // Approximate coordinates for Long Valley, NJ
          longitude: -74.7690,
          city: 'Long Valley',
          state: 'NJ',
          address: 'Long Valley, NJ',
        };
      }
    }
    throw error;
  }
};

/**
 * Get location string from coordinates (reverse geocoding)
 * Uses a simple approach - in production, use Google Geocoding API
 */
export const getLocationString = (coords: LocationCoordinates): string => {
  if (coords.city && coords.state) {
    return `${coords.city}, ${coords.state}`;
  }
  if (coords.address) {
    // Extract city/state from address if available
    const addressParts = coords.address.split(',');
    if (addressParts.length >= 2) {
      const cityState = addressParts.slice(-2).join(', ').trim();
      return cityState;
    }
    return coords.address;
  }
  return `${coords.latitude}, ${coords.longitude}`;
};

const buildClient = async () => {
  let token: string | undefined;
  try {
    token = await getAccessToken();
  } catch (error) {
    token = process.env.GOOGLE_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        'Missing access token. Set up refresh token flow or provide GOOGLE_ACCESS_TOKEN.'
      );
    }
  }

  return axios.create({
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
};

