import dotenv from 'dotenv';
import { getWebsiteContext } from './websiteContext';
import { getBusinessSettings } from './settingsService';
import { getDefaultBusinessId } from './tenantDefaults';

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
export const getBusinessConfig = async (businessIdOverride?: string): Promise<BusinessConfig> => {
  // Priority: Settings (DB) > ENV vars > Website context > Defaults
  let settings: any = null;
  try {
    const businessId = businessIdOverride || (await getDefaultBusinessId());
    settings = await getBusinessSettings(businessId);
  } catch {
    // non-fatal: fall back to env / website context
  }

  const config: BusinessConfig = {
    name: settings?.businessName || process.env.BUSINESS_NAME || 'Malama Dental',
    location: settings?.businessLocation || process.env.BUSINESS_LOCATION || 'Long Valley, NJ',
    websiteUrl: settings?.websiteUrl || process.env.WEBSITE_URL || 'https://malama.dental',
    phone: settings?.businessPhone || process.env.BUSINESS_PHONE,
    email: settings?.businessEmail || process.env.BUSINESS_EMAIL,
  };

  // ENV variables take priority - only use website context as fallback if ENV not set
  // Always prioritize BUSINESS_NAME from ENV for consistency
  
  // Try to enrich from website context ONLY if ENV vars not set
  if ((!config.phone && !process.env.BUSINESS_PHONE) || (!process.env.BUSINESS_LOCATION && !config.location)) {
    try {
      const websiteContext = await getWebsiteContext();
      if (websiteContext) {
        // Only override if ENV var not explicitly set
        if (!process.env.BUSINESS_LOCATION) {
          config.location = websiteContext.location || config.location;
        }
        if (!process.env.BUSINESS_PHONE && !config.phone) {
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

