import type { TenantRole } from './tenant';

const normalize = (r: string): TenantRole => {
  const up = String(r || '').toUpperCase();
  if (up === 'OWNER' || up === 'ADMIN' || up === 'STAFF') return up as TenantRole;
  return 'STAFF';
};

/**
 * RBAC middleware: requires the current tenant role to be one of `allowed`.
 * Must be used after `tenantGuard` so `req.tenant` is present.
 */
export const requireRole = (allowed: TenantRole[]) => {
  const allowedSet = new Set(allowed.map((r) => normalize(r)));

  return (req: any, res: any, next: any) => {
    const tenant = req.tenant as { role?: TenantRole } | undefined;
    const role = normalize(tenant?.role || 'STAFF');
    if (!allowedSet.has(role)) {
      return res.status(403).json({ error: 'Forbidden', requiredRole: Array.from(allowedSet), role });
    }
    next();
  };
};


