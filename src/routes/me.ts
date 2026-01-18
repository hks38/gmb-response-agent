import express from 'express';
import { prisma } from '../db/client';

const router = express.Router();

/**
 * GET /api/me
 * Returns the DB user and their business memberships + activeBusinessId.
 */
router.get('/', async (req, res) => {
  try {
    const sessionUser = (req as any).user as { userId: string; activeBusinessId?: string } | undefined;
    if (!sessionUser?.userId) return res.status(401).json({ error: 'Not authenticated' });

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.userId },
      include: {
        memberships: {
          include: { business: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const activeBusinessId =
      sessionUser.activeBusinessId || user.memberships[0]?.businessId || null;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      memberships: user.memberships.map((m) => ({
        businessId: m.businessId,
        role: m.role,
        business: { id: m.business.id, name: m.business.name },
      })),
      activeBusinessId,
    });
  } catch (err: any) {
    console.error('Failed to load /api/me', err);
    res.status(500).json({ error: 'Failed to load me', message: err.message });
  }
});

export default router;


