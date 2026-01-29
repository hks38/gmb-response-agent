import axios from 'axios';

const PLACES_BASE = 'https://places.googleapis.com/v1';

export type PlacesLatLng = { latitude: number; longitude: number };

export interface PlacesReview {
  name?: string;
  relativePublishTimeDescription?: string;
  text?: { text?: string; languageCode?: string };
  rating?: number;
  originalText?: { text?: string; languageCode?: string };
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  publishTime?: string;
}

export interface PlacesPlaceDetails {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  reviews?: PlacesReview[];
  location?: PlacesLatLng; // location.latitude, location.longitude
}

const apiKey = () => String(process.env.GOOGLE_PLACES_API_KEY || '').trim();

export const isPlacesConfigured = () => !!apiKey();

const client = () => {
  if (!isPlacesConfigured()) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  }
  return axios.create({
    baseURL: PLACES_BASE,
    headers: {
      'X-Goog-Api-Key': apiKey(),
      'Content-Type': 'application/json',
    },
    timeout: 20_000,
  });
};

/**
 * Fetch place details by Place ID.
 *
 * Uses field masks (X-Goog-FieldMask) for cost control.
 */
export async function getPlaceDetails(params: {
  placeId: string;
  fieldMask?: string; // e.g. "id,displayName,formattedAddress,rating,userRatingCount,websiteUri,reviews"
}): Promise<PlacesPlaceDetails> {
  const placeId = String(params.placeId || '').trim();
  if (!placeId) throw new Error('placeId is required');
  const fieldMask =
    params.fieldMask ||
    'id,displayName,formattedAddress,internationalPhoneNumber,websiteUri,rating,userRatingCount,reviews,location';

  const res = await client().get(`/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-FieldMask': fieldMask,
    },
  });
  return res.data as PlacesPlaceDetails;
}

/**
 * Text Search (discovery) using Places API.
 * See: Places API v1: /places:searchText
 */
export async function searchTextPlaces(params: {
  textQuery: string;
  maxResultCount?: number;
  locationBiasCircle?: { center: PlacesLatLng; radiusMeters: number };
  includedType?: string; // e.g. "dentist"
}): Promise<{ places: PlacesPlaceDetails[] }> {
  const textQuery = String(params.textQuery || '').trim();
  if (!textQuery) throw new Error('textQuery is required');
  const maxResultCount = Math.max(1, Math.min(20, params.maxResultCount ?? 10));

  const body: any = {
    textQuery,
    maxResultCount,
  };

  if (params.includedType) body.includedType = String(params.includedType);
  if (params.locationBiasCircle?.center) {
    body.locationBias = {
      circle: {
        center: {
          latitude: params.locationBiasCircle.center.latitude,
          longitude: params.locationBiasCircle.center.longitude,
        },
        radius: params.locationBiasCircle.radiusMeters,
      },
    };
  }

  const res = await client().post(`/places:searchText`, body, {
    headers: {
      // Request fields we need for discovery and filtering
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.internationalPhoneNumber,places.location,places.primaryType,places.types',
    },
  });

  return { places: (res.data?.places || []) as PlacesPlaceDetails[] };
}


