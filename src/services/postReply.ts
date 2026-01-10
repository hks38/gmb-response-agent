import axios from 'axios';
import dotenv from 'dotenv';
import { getAccessToken } from './googleAuth';

dotenv.config();

const BASE_URL_V4 = 'https://mybusiness.googleapis.com/v4';

/**
 * Post a reply to a Google Business Profile review
 */
export const postReplyToReview = async (params: {
  accountId: string;
  locationId: string;
  reviewId: string;
  replyText: string;
}): Promise<void> => {
  const numericLocationId = params.locationId.startsWith('locations/')
    ? params.locationId.split('/')[1]
    : params.locationId;

  // The endpoint format is: accounts/{accountId}/locations/{locationId}/reviews/{reviewId}/reply
  // Note: reviewId should not be URL-encoded, and accountId/locationId should not have "accounts/" or "locations/" prefix
  const accountIdClean = params.accountId.replace(/^accounts\//, '');
  const endpoint = `${BASE_URL_V4}/accounts/${accountIdClean}/locations/${numericLocationId}/reviews/${params.reviewId}/reply`;

  // Ensure we have a fresh token before posting
  const client = await buildClient();
  
  console.log(`Posting reply to review: ${params.reviewId}...`);
  console.log(`Endpoint: ${endpoint}`);

  try {
    // Use PUT method as per Google Business Profile API docs for updateReply
    const response = await client.put(endpoint, {
      comment: params.replyText,
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    console.log('✅ Reply posted successfully!');
    return;
  } catch (error: any) {
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;

      if (status === 409) {
        throw new Error(`Reply already exists for this review. Review ID: ${params.reviewId}`);
      } else if (status === 403) {
        throw new Error(
          `Access denied (403). Error: ${errorData?.error?.message || error.message}\n` +
          `This usually means:\n` +
          `  - Your OAuth token doesn't have the 'business.manage' scope\n` +
          `  - You don't have permission to reply to reviews for this location\n` +
          `  - The review might be from a different location`
        );
      } else if (status === 404) {
        throw new Error(`Review not found (404). Review ID: ${params.reviewId}`);
      }

      throw new Error(`Failed to post reply: ${status} - ${errorData?.error?.message || error.message}`);
    }

    throw error;
  }
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

