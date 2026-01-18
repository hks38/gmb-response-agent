import axios from 'axios';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city?: string;
  state?: string;
  placeId?: string;
}

/**
 * Geocode an address using Google Geocoding API
 */
export async function geocodeAddress(
  address: string,
  apiKey?: string
): Promise<GeocodeResult> {
  const key = apiKey || process.env.GOOGLE_MAPS_API_KEY;
  
  if (!key) {
    throw new Error('Google Maps API key is required. Set GOOGLE_MAPS_API_KEY in .env');
  }

  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          address,
          key,
        },
      }
    );

    if (response.data.status !== 'OK' || !response.data.results.length) {
      throw new Error(`Geocoding failed: ${response.data.status}`);
    }

    const result = response.data.results[0];
    const location = result.geometry.location;
    
    // Extract city and state from address components
    let city: string | undefined;
    let state: string | undefined;
    
    for (const component of result.address_components) {
      if (component.types.includes('locality')) {
        city = component.long_name;
      }
      if (component.types.includes('administrative_area_level_1')) {
        state = component.short_name;
      }
    }

    return {
      latitude: location.lat,
      longitude: location.lng,
      formattedAddress: result.formatted_address,
      city,
      state,
      placeId: result.place_id,
    };
  } catch (error: any) {
    throw new Error(`Geocoding error: ${error.message}`);
  }
}

/**
 * Find nearby places (cities/towns) within a radius
 * Uses Google Places API Nearby Search
 */
export async function findNearbyPlaces(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  apiKey?: string
): Promise<GeocodeResult[]> {
  const key = apiKey || process.env.GOOGLE_MAPS_API_KEY;
  
  if (!key) {
    throw new Error('Google Maps API key is required. Set GOOGLE_MAPS_API_KEY in .env');
  }

  try {
    // Convert radius from miles to meters
    const radiusInMeters = radiusMeters * 1609.34;

    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
      {
        params: {
          location: `${latitude},${longitude}`,
          radius: radiusInMeters,
          type: 'locality', // Cities and towns
          key,
        },
      }
    );

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      throw new Error(`Places API error: ${response.data.status}`);
    }

    const places: GeocodeResult[] = (response.data.results || []).map((place: any) => {
      const location = place.geometry.location;
      let city: string | undefined;
      let state: string | undefined;

      // Extract city and state from address components if available
      if (place.vicinity) {
        // For some results, we only have vicinity
        const parts = place.vicinity.split(',');
        city = parts[0]?.trim();
      }

      return {
        latitude: location.lat,
        longitude: location.lng,
        formattedAddress: place.vicinity || place.name,
        city: city || place.name,
        state,
        placeId: place.place_id,
      };
    });

    return places;
  } catch (error: any) {
    throw new Error(`Places API error: ${error.message}`);
  }
}

/**
 * Get location geocode ID for Google Ads API
 * This is a simplified version - in production you'd use Google Ads LocationCriterionService
 */
export function getLocationGeocode(latitude: number, longitude: number, city?: string, state?: string): string {
  // For now, return a format that can be used
  // In production, you'd query Google Ads API for location criterion IDs
  if (city && state) {
    return `${city}, ${state}`;
  }
  return `${latitude},${longitude}`;
}


