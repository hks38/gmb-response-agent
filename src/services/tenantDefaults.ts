import { prisma } from '../db/client';

/**
 * Transitional helper while we move to full multi-tenant routing.
 * Uses seeded IDs from the migration, unless overridden by env.
 */
export const getDefaultBusinessId = async (): Promise<string> => {
  if (process.env.DEFAULT_BUSINESS_ID) return process.env.DEFAULT_BUSINESS_ID;
  // migration seeds biz_default; fall back to first business if it exists
  const any = await prisma.business.findFirst({ orderBy: { createdAt: 'asc' } });
  return any?.id || 'biz_default';
};

export const getDefaultLocationId = async (): Promise<string> => {
  if (process.env.DEFAULT_LOCATION_INTERNAL_ID) return process.env.DEFAULT_LOCATION_INTERNAL_ID;
  const businessId = await getDefaultBusinessId();
  const any = await prisma.location.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'asc' },
  });
  return any?.id || 'loc_default';
};


