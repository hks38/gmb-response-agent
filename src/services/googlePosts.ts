import axios from 'axios';
import dotenv from 'dotenv';
import { getAccessToken } from './googleAuth';

dotenv.config();

const BASE_URL_V4 = 'https://mybusiness.googleapis.com/v4';
const BASE_URL_BI = 'https://mybusinessbusinessinformation.googleapis.com/v1';

export interface GBPLocalPost {
  languageCode?: string;
  summary?: string;
  callToAction?: {
    actionType: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL';
    url?: string;
  };
  media?: Array<{
    mediaFormat: 'MEDIA_FORMAT_UNSPECIFIED' | 'PHOTO' | 'VIDEO';
    sourceUrl?: string;
    thumbnailUrl?: string;
  }>;
  topicType?: 'TOPIC_TYPE_UNSPECIFIED' | 'STANDARD' | 'EVENT' | 'OFFER' | 'ALERT' | 'COVID_19';
  event?: {
    title?: string;
    schedule?: {
      startDate?: { year: number; month: number; day: number };
      endDate?: { year: number; month: number; day: number };
      startTime?: { hours: number; minutes: number; seconds: number; nanos: number };
      endTime?: { hours: number; minutes: number; seconds: number; nanos: number };
      allDay?: boolean;
    };
  };
}

export interface GBPLocalPostInput {
  accountId: string;
  locationId: string;
  post: GBPLocalPost;
}

export interface GBPLocalPostResponse {
  name: string;
  summary: string;
  state: 'LOCAL_POST_STATE_UNSPECIFIED' | 'REJECTED' | 'LIVE' | 'PROCESSING';
  createTime: string;
  updateTime: string;
}

/**
 * Create a local post on Google Business Profile
 */
export const createLocalPost = async (params: GBPLocalPostInput): Promise<GBPLocalPostResponse> => {
  const client = await buildClient();
  
  const numericLocationId = params.locationId.startsWith('locations/')
    ? params.locationId.split('/')[1]
    : params.locationId;

  const accountIdClean = params.accountId.replace(/^accounts\//, '');

  // Prepare post payload
  const postPayload: any = {
    languageCode: params.post.languageCode || 'en-US',
    summary: params.post.summary,
    topicType: params.post.topicType || 'STANDARD',
  };

  // Handle call-to-action
  if (params.post.callToAction) {
    postPayload.callToAction = {
      actionType: params.post.callToAction.actionType,
    };
    
    // For CALL action, don't include URL (Google uses business phone)
    // For other actions, include URL if provided
    if (params.post.callToAction.actionType !== 'CALL' && params.post.callToAction.url) {
      postPayload.callToAction.url = params.post.callToAction.url;
    }
  }

  // Add media if provided
  if (params.post.media && params.post.media.length > 0) {
    postPayload.media = params.post.media;
  }

  // Add event if provided
  if (params.post.event) {
    postPayload.event = params.post.event;
  }

    // Handle media (images) - convert file paths to base64 or upload
    if (params.post.media && params.post.media.length > 0) {
      // For GMB API, media needs to be uploaded separately or provided as URLs
      // If media has sourceUrl, use it directly
      // If it's a local file path, we need to upload it first
      // For now, GMB API may accept base64 or we need to upload to a public URL first
      // TODO: Implement proper image upload if needed
      console.log(`   📸 Including ${params.post.media.length} media file(s) in post...`);
    }

    // Try the Business Information API first (newer API)
    let endpoint = `${BASE_URL_BI}/accounts/${accountIdClean}/locations/${numericLocationId}/localPosts`;
    
    console.log(`Creating local post at: ${endpoint}...`);

    try {
      const response = await client.post(endpoint, postPayload, {
        params: {
          // Required parameter for local posts
        },
      });

    console.log('✅ Local post created successfully!');
    return response.data;
  } catch (error: any) {
    // If BI API fails, try the old v4 API
    if (error.response?.status === 404 || error.response?.status === 400) {
      console.log('Trying v4 API endpoint...');
      endpoint = `${BASE_URL_V4}/accounts/${accountIdClean}/locations/${numericLocationId}/localPosts`;

      try {
        const response = await client.post(endpoint, postPayload);
        console.log('✅ Local post created successfully (via v4 API)!');
        return response.data;
      } catch (v4Error: any) {
        handlePostError(v4Error, params);
        throw v4Error;
      }
    }

    handlePostError(error, params);
    throw error;
  }
};

const handlePostError = (error: any, params: GBPLocalPostInput) => {
  if (error.response) {
    const status = error.response.status;
    const errorData = error.response.data;

    if (status === 403) {
      throw new Error(
        `Access denied (403). Error: ${errorData?.error?.message || error.message}\n` +
        `This usually means:\n` +
        `  - Your OAuth token doesn't have the 'business.manage' scope\n` +
        `  - The "My Business Business Information API" needs to be enabled\n` +
        `  - You don't have permission to create posts for this location`
      );
    } else if (status === 404) {
      throw new Error(
        `Local posts endpoint not found (404). ` +
        `Make sure the "My Business Business Information API" is enabled in Google Cloud Console.`
      );
    } else if (status === 400) {
      const errorMessage = errorData?.error?.message || error.message;
      const errorDetails = JSON.stringify(errorData, null, 2);
      
      throw new Error(
        `Invalid request (400). Error: ${errorMessage}\n` +
        `This usually means:\n` +
        `  - Call-to-action type doesn't match the provided URL\n` +
        `  - CALL action should not include a URL (Google uses business phone)\n` +
        `  - Post summary exceeds character limit\n` +
        `  - Invalid post structure\n` +
        `\nError details: ${errorDetails.substring(0, 500)}`
      );
    }

    throw new Error(`Failed to create post: ${status} - ${errorData?.error?.message || error.message}`);
  }
  throw error;
};

const buildClient = async () => {
  let token: string | undefined;
  try {
    token = await getAccessToken();
  } catch (error) {
    token = process.env.GOOGLE_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        'Missing access token. Set up refresh token flow (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN) or provide GOOGLE_ACCESS_TOKEN.'
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

/**
 * List all local posts for a location
 */
export const listLocalPosts = async (params: {
  accountId: string;
  locationId: string;
}): Promise<GBPLocalPostResponse[]> => {
  const client = await buildClient();
  
  const numericLocationId = params.locationId.startsWith('locations/')
    ? params.locationId.split('/')[1]
    : params.locationId;

  const accountIdClean = params.accountId.replace(/^accounts\//, '');

  // Try Business Information API first
  let endpoint = `${BASE_URL_BI}/accounts/${accountIdClean}/locations/${numericLocationId}/localPosts`;

  try {
    const response = await client.get(endpoint);
    return response.data.localPosts || [];
  } catch (error: any) {
    // Fallback to v4 API
    if (error.response?.status === 404) {
      endpoint = `${BASE_URL_V4}/accounts/${accountIdClean}/locations/${numericLocationId}/localPosts`;
      try {
        const response = await client.get(endpoint);
        return response.data.localPosts || [];
      } catch (v4Error: any) {
        throw new Error(`Failed to list posts: ${v4Error.message}`);
      }
    }
    throw error;
  }
};

