import { prisma } from '../db/client';
import { getDefaultLocationId } from '../services/tenantDefaults';

export type TenantRole = 'OWNER' | 'ADMIN' | 'STAFF';

export interface TenantContext {
  businessId: string;
  role: TenantRole;
  locationId?: string | null;
}

/**
 * Resolves the active tenant (business + role) for this request.
 * Requires session user to have an activeBusinessId (set via login or /api/business/switch).
 *
 * Attaches `req.tenant`.
 */
export const tenantGuard = async (req: any, res: any, next: any) => {
  try {
    const sessionUser = req.user as { userId?: string; activeBusinessId?: string } | undefined;
    if (!sessionUser?.userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!sessionUser.activeBusinessId) {
      return res.status(400).json({ error: 'No active business selected' });
    }

    const businessId = sessionUser.activeBusinessId;
    const membership = await prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId: sessionUser.userId, businessId } },
    });
    if (!membership) return res.status(403).json({ error: 'Not a member of the active business' });

    let locationId = (req.query?.locationId || req.headers['x-location-id'] || null) as string | null;
    // If no locationId provided, try to get the default location for this business
    if (!locationId) {
      try {
        const defaultLoc = await prisma.location.findFirst({
          where: { businessId },
          orderBy: { createdAt: 'asc' },
        });
        locationId = defaultLoc?.id || null;
      } catch {
        // Fall back to global default if business lookup fails
        try {
          locationId = await getDefaultLocationId();
        } catch {
          locationId = null;
        }
      }
    }

    const tenant: TenantContext = {
      businessId,
      role: (membership.role as TenantRole) || 'STAFF',
      locationId: locationId ? String(locationId) : null,
    };

    req.tenant = tenant;
    next();
  } catch (err: any) {
    console.error('tenantGuard failed', err);
    res.status(500).json({ error: 'Tenant resolution failed', message: err.message });
  }
};


