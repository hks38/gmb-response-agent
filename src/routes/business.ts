import express from 'express';
import { prisma } from '../db/client';
import { buildSetCookie, createSessionToken } from '../services/session';
import { sendEmail } from '../services/emailService';
import crypto from 'crypto';

const router = express.Router();

const SESSION_COOKIE = 'app_session';
const isSecureCookie = (): boolean => process.env.NODE_ENV === 'production';

const requireActiveBusiness = async (req: any) => {
  const sessionUser = req.user as { userId?: string; activeBusinessId?: string; email?: string; name?: string; picture?: string } | undefined;
  if (!sessionUser?.userId) throw new Error('Not authenticated');
  const businessId = sessionUser.activeBusinessId;
  if (!businessId) throw new Error('No active business selected');

  const membership = await prisma.businessMembership.findUnique({
    where: { userId_businessId: { userId: sessionUser.userId, businessId } },
  });
  if (!membership) throw new Error('Not a member of the active business');

  return { sessionUser, businessId, role: String(membership.role || 'STAFF').toUpperCase() };
};

const requireAdmin = async (req: any) => {
  const ctx = await requireActiveBusiness(req);
  if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') throw new Error('Forbidden');
  return ctx;
};

/**
 * POST /api/business/switch
 * Body: { businessId }
 *
 * Updates the session cookie to set the activeBusinessId.
 */
router.post('/switch', async (req, res) => {
  try {
    const sessionUser = (req as any).user as {
      userId: string;
      email?: string;
      name?: string;
      picture?: string;
    } | undefined;
    if (!sessionUser?.userId) return res.status(401).json({ error: 'Not authenticated' });

    const businessId = String(req.body?.businessId || '');
    if (!businessId) return res.status(400).json({ error: 'businessId is required' });

    const membership = await prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId: sessionUser.userId, businessId } },
    });
    if (!membership) return res.status(403).json({ error: 'Not a member of that business' });

    const token = createSessionToken({
      userId: sessionUser.userId,
      email: sessionUser.email,
      name: sessionUser.name,
      picture: sessionUser.picture,
      activeBusinessId: businessId,
    });

    const setSession = buildSetCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureCookie(),
      path: '/',
      maxAgeSeconds: 60 * 60 * 24 * 7,
    });
    res.setHeader('Set-Cookie', setSession);
    res.json({ success: true, activeBusinessId: businessId });
  } catch (err: any) {
    console.error('Failed to switch business', err);
    res.status(500).json({ error: 'Failed to switch business', message: err.message });
  }
});

/**
 * Team management (Owner/Admin only)
 */
router.get('/members', async (req, res) => {
  try {
    const { businessId } = await requireAdmin(req as any);
    const members = await prisma.businessMembership.findMany({
      where: { businessId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      success: true,
      members: members.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        createdAt: m.createdAt,
      })),
    });
  } catch (err: any) {
    const code = err.message === 'Forbidden' ? 403 : err.message === 'Not authenticated' ? 401 : 400;
    res.status(code).json({ error: err.message });
  }
});

router.post('/invite', async (req, res) => {
  try {
    const { businessId } = await requireAdmin(req as any);
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();
    const role = String(req.body?.role || 'STAFF').toUpperCase();
    if (!emailRaw || !emailRaw.includes('@')) return res.status(400).json({ error: 'Valid email is required' });
    if (!['OWNER', 'ADMIN', 'STAFF'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const user = await prisma.user.upsert({
      where: { email: emailRaw },
      create: { email: emailRaw },
      update: {},
    });

    await prisma.businessMembership.upsert({
      where: { userId_businessId: { userId: user.id, businessId } },
      create: { userId: user.id, businessId, role },
      update: { role },
    });

    // Send a magic link invite (optional but helpful)
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.authMagicLink.create({
        data: { email: emailRaw, tokenHash, expiresAt, userId: user.id },
      });

      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const link = `${baseUrl}/api/auth/login/magic-link/callback?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: emailRaw,
        subject: 'You were invited to the dashboard',
        text: `You’ve been invited to access a business dashboard.\n\nSign in link (valid for 24 hours):\n${link}\n`,
      });
    } catch (e: any) {
      // non-fatal
      console.warn('Invite email failed (non-fatal):', e.message);
    }

    res.json({ success: true });
  } catch (err: any) {
    const code = err.message === 'Forbidden' ? 403 : err.message === 'Not authenticated' ? 401 : 400;
    res.status(code).json({ error: err.message });
  }
});

router.patch('/members/:userId', async (req, res) => {
  try {
    const { businessId } = await requireAdmin(req as any);
    const userId = String(req.params.userId || '');
    const role = String(req.body?.role || '').toUpperCase();
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!['OWNER', 'ADMIN', 'STAFF'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    await prisma.businessMembership.update({
      where: { userId_businessId: { userId, businessId } },
      data: { role },
    });
    res.json({ success: true });
  } catch (err: any) {
    const code = err.message === 'Forbidden' ? 403 : err.message === 'Not authenticated' ? 401 : 400;
    res.status(code).json({ error: err.message });
  }
});

router.delete('/members/:userId', async (req, res) => {
  try {
    const { businessId } = await requireAdmin(req as any);
    const userId = String(req.params.userId || '');
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    await prisma.businessMembership.delete({
      where: { userId_businessId: { userId, businessId } },
    });
    res.json({ success: true });
  } catch (err: any) {
    const code = err.message === 'Forbidden' ? 403 : err.message === 'Not authenticated' ? 401 : 400;
    res.status(code).json({ error: err.message });
  }
});

export default router;


