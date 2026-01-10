import dotenv from 'dotenv';
import { getWebsiteContext } from './websiteContext';

dotenv.config();

export interface BusinessConfig {
  name: string;
  location: string;
  websiteUrl: string;
  phone?: string;
  email?: string;
}

/**
 * Get business configuration from environment variables or website context
 */
export const getBusinessConfig = async (): Promise<BusinessConfig> => {
  // Priority: ENV vars > Website context > Defaults
  
  const config: BusinessConfig = {
    name: process.env.BUSINESS_NAME || 'Malama Dental',
    location: process.env.BUSINESS_LOCATION || 'Long Valley, NJ',
    websiteUrl: process.env.WEBSITE_URL || 'https://malama.dental',
    phone: process.env.BUSINESS_PHONE,
    email: process.env.BUSINESS_EMAIL,
  };

  // ENV variables take priority - only use website context as fallback if ENV not set
  // Always prioritize BUSINESS_NAME from ENV for consistency
  
  // Try to enrich from website context ONLY if ENV vars not set
  if (!process.env.BUSINESS_PHONE || !process.env.BUSINESS_LOCATION) {
    try {
      const websiteContext = await getWebsiteContext();
      if (websiteContext) {
        // Only override if ENV var not explicitly set
        if (!process.env.BUSINESS_LOCATION) {
          config.location = websiteContext.location || config.location;
        }
        if (!process.env.BUSINESS_PHONE) {
          config.phone = websiteContext.phone || config.phone;
        }
        // Note: We never override BUSINESS_NAME from website context - always use ENV or default
      }
    } catch (error) {
      // Continue with env/default values if website context fails
    }
  }

  return config;
};

/**
 * Get business name (quick access without async)
 */
export const getBusinessName = (): string => {
  return process.env.BUSINESS_NAME || 'Malama Dental';
};

