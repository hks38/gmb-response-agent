import express from 'express';
import { getAuthUrl, getTokensFromCode } from '../services/googleAuth';
import crypto from 'crypto';
import { getGoogleLoginUrl, exchangeCodeForLoginUser } from '../services/googleLogin';
import { buildSetCookie, createSessionToken, parseCookies, verifySessionToken } from '../services/session';
import { prisma } from '../db/client';
import { sendEmail } from '../services/emailService';
import { encryptString } from '../services/encryption';
import { getDefaultLocationId } from '../services/tenantDefaults';

const router = express.Router();

const SESSION_COOKIE = 'app_session';
const OAUTH_STATE_COOKIE = 'oauth_state';
const GBP_STATE_COOKIE = 'gbp_oauth_state';
const GBP_CTX_COOKIE = 'gbp_oauth_ctx';

const isSecureCookie = (): boolean => process.env.NODE_ENV === 'production';

const requireSessionUser = (req: express.Request): { userId: string; activeBusinessId?: string; email?: string; name?: string; picture?: string } => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  const user = token ? verifySessionToken(token) : null;
  if (!user?.userId) {
    throw new Error('Not authenticated');
  }
  return user as any;
};

/**
 * GET /api/auth/google/connect
 * Generate OAuth URL and redirect user to Google
 */
router.get('/google/connect', async (req, res) => {
  try {
    const user = requireSessionUser(req);
    const businessId = String((req.query as any)?.businessId || user.activeBusinessId || 'biz_default');
    const locationId = String((req.query as any)?.locationId || (await getDefaultLocationId()));

    const membership = await prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId: user.userId, businessId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of that business' });
    }
    const role = String(membership.role || '').toUpperCase();
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const state = crypto.randomBytes(16).toString('hex');
    const setState = buildSetCookie(GBP_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureCookie(),
      path: '/',
      maxAgeSeconds: 10 * 60,
    });

    // Store business/location context for callback
    const ctx = JSON.stringify({ businessId, locationId: locationId || null });
    const setCtx = buildSetCookie(GBP_CTX_COOKIE, ctx, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureCookie(),
      path: '/',
      maxAgeSeconds: 10 * 60,
    });
    res.setHeader('Set-Cookie', [setState, setCtx]);

    const authUrl = getAuthUrl(state);
    res.redirect(authUrl);
  } catch (error: any) {
    console.error('Failed to generate OAuth URL:', error);
    res.status(error.message === 'Not authenticated' ? 401 : 500).json({ error: 'Failed to generate OAuth URL', message: error.message });
  }
});

/**
 * =========================================
 * App Login (Google-only)
 * =========================================
 */

/**
 * GET /api/auth/login/google
 * Start Google login flow (OIDC) for the portal
 */
router.get('/login/google', (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const setState = buildSetCookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureCookie(),
      path: '/',
      maxAgeSeconds: 10 * 60,
    });
    res.setHeader('Set-Cookie', setState);

    const url = getGoogleLoginUrl(state);
    res.redirect(url);
  } catch (error: any) {
    console.error('Failed to start Google login:', error);
    res.redirect(`/login?error=${encodeURIComponent(error.message || 'login_failed')}`);
  }
});

/**
 * GET /api/auth/login/google/callback
 * OAuth callback for app login
 */
router.get('/login/google/callback', async (req, res) => {
  try {
    const { code, error, state } = req.query as any;

    if (error) {
      return res.redirect(`/login?error=${encodeURIComponent(String(error))}`);
    }
    if (!code || !state) {
      return res.redirect('/login?error=missing_code_or_state');
    }

    const cookies = parseCookies(req.headers.cookie);
    const expectedState = cookies[OAUTH_STATE_COOKIE];
    if (!expectedState || expectedState !== String(state)) {
      return res.redirect('/login?error=invalid_state');
    }

    const googleUser = await exchangeCodeForLoginUser(String(code));
    if (!googleUser.email) return res.redirect('/login?error=missing_email');
    const email = String(googleUser.email).toLowerCase();

    const dbUser = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: googleUser.name || null,
        avatarUrl: googleUser.picture || null,
      },
      update: {
        name: googleUser.name || null,
        avatarUrl: googleUser.picture || null,
      },
    });

    // Ensure the user belongs to at least one business (bootstrap default)
    const existingMemberships = await prisma.businessMembership.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: 'asc' },
    });
    if (existingMemberships.length === 0) {
      // Default business/location are created by migration, but be defensive
      await prisma.business.upsert({
        where: { id: 'biz_default' },
        create: { id: 'biz_default', name: 'Default Business' },
        update: {},
      });

      await prisma.location.upsert({
        where: { id: 'loc_default' },
        create: { id: 'loc_default', businessId: 'biz_default', name: 'Default Location' },
        update: {},
      });

      await prisma.businessSettings.upsert({
        where: { businessId: 'biz_default' },
        create: { businessId: 'biz_default' },
        update: {},
      });

      await prisma.businessMembership.create({
        data: { userId: dbUser.id, businessId: 'biz_default', role: 'OWNER' },
      });
    }

    const memberships = await prisma.businessMembership.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: 'asc' },
    });
    const activeBusinessId = memberships[0]?.businessId || 'biz_default';

    const token = createSessionToken(
      {
        userId: dbUser.id,
        email: dbUser.email,
        name: dbUser.name || undefined,
        picture: dbUser.avatarUrl || undefined,
        activeBusinessId,
      },
      60 * 60 * 24 * 7
    );

    const setSession = buildSetCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureCookie(),
      path: '/',
      maxAgeSeconds: 60 * 60 * 24 * 7,
    });
    const clearState = buildSetCookie(OAUTH_STATE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureCookie(),
      path: '/',
      maxAgeSeconds: 0,
    });
    res.setHeader('Set-Cookie', [setSession, clearState]);

    return res.redirect('/portal');
  } catch (err: any) {
    console.error('Google login callback failed:', err);
    return res.redirect(`/login?error=${encodeURIComponent(err.message || 'login_callback_failed')}`);
  }
});

/**
 * GET /api/auth/me
 * Return current logged-in user (if any)
 */
router.get('/me', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return res.json({ authenticated: false });
  const user = verifySessionToken(token);
  if (!user) return res.json({ authenticated: false });
  return res.json({ authenticated: true, user });
});

/**
 * =========================================
 * Magic link login
 * =========================================
 */

router.post('/login/magic-link', async (req, res) => {
  try {
    const emailRaw = String(req.body?.email || '').trim();
    const email = emailRaw.toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.authMagicLink.create({
      data: {
        email,
        tokenHash,
        expiresAt,
      },
    });

    const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/api/auth/login/magic-link/callback?token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: email,
      subject: 'Your sign-in link',
      text: `Click to sign in (valid for 15 minutes):\n\n${link}\n`,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to send magic link', err);
    res.status(500).json({ error: 'Failed to send magic link', message: err.message });
  }
});

router.get('/login/magic-link/callback', async (req, res) => {
  try {
    const token = String((req.query as any)?.token || '');
    if (!token) return res.redirect('/login?error=missing_magic_token');

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const link = await prisma.authMagicLink.findUnique({ where: { tokenHash } });
    if (!link) return res.redirect('/login?error=invalid_magic_link');
    if (link.usedAt) return res.redirect('/login?error=magic_link_used');
    if (new Date(link.expiresAt).getTime() < Date.now()) return res.redirect('/login?error=magic_link_expired');

    const email = link.email.toLowerCase();
    const dbUser = await prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });

    const memberships = await prisma.businessMembership.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: 'asc' },
    });
    if (memberships.length === 0) {
      await prisma.business.upsert({
        where: { id: 'biz_default' },
        create: { id: 'biz_default', name: 'Default Business' },
        update: {},
      });
      await prisma.location.upsert({
        where: { id: 'loc_default' },
        create: { id: 'loc_default', businessId: 'biz_default', name: 'Default Location' },
        update: {},
      });
      await prisma.businessSettings.upsert({
        where: { businessId: 'biz_default' },
        create: { businessId: 'biz_default' },
        update: {},
      });
      await prisma.businessMembership.create({
        data: { userId: dbUser.id, businessId: 'biz_default', role: 'OWNER' },
      });
    }

    const freshMemberships = await prisma.businessMembership.findMany({
      where: { userId: dbUser.id },
      orderBy: { createdAt: 'asc' },
    });
    const activeBusinessId = freshMemberships[0]?.businessId || 'biz_default';

    await prisma.authMagicLink.update({
      where: { tokenHash },
      data: { usedAt: new Date(), userId: dbUser.id },
    });

    const session = createSessionToken(
      { userId: dbUser.id, email: dbUser.email, activeBusinessId },
      60 * 60 * 24 * 7
    );
    const setSession = buildSetCookie(SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecureCookie(),
      path: '/',
      maxAgeSeconds: 60 * 60 * 24 * 7,
    });
    res.setHeader('Set-Cookie', setSession);
    res.redirect('/portal');
  } catch (err: any) {
    console.error('Magic link callback failed', err);
    res.redirect(`/login?error=${encodeURIComponent(err.message || 'magic_link_failed')}`);
  }
});

/**
 * POST /api/auth/logout
 * Clear session cookie
 */
router.post('/logout', (_req, res) => {
  const clear = buildSetCookie(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureCookie(),
    path: '/',
    maxAgeSeconds: 0,
  });
  res.setHeader('Set-Cookie', clear);
  res.json({ success: true });
});

/**
 * GET /api/auth/google/callback
 * Handle OAuth callback from Google
 */
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error, state } = req.query;

    // Handle OAuth errors from Google
    if (error) {
      console.error('OAuth error from Google:', error);
      return res.redirect(`/?oauth_error=${encodeURIComponent(error.toString())}`);
    }

    if (!code) {
      console.error('No authorization code received from Google');
      return res.redirect('/?oauth_error=no_authorization_code');
    }

    // Validate state + read ctx cookie
    const cookies = parseCookies(req.headers.cookie);
    const expectedState = cookies[GBP_STATE_COOKIE];
    if (!expectedState || expectedState !== String(state || '')) {
      return res.redirect('/portal?oauth_error=invalid_state');
    }
    let ctx: { businessId?: string; locationId?: string | null } = {};
    try {
      ctx = JSON.parse(cookies[GBP_CTX_COOKIE] || '{}');
    } catch {
      ctx = {};
    }

    const sessionUser = requireSessionUser(req);
    const businessId = String(ctx.businessId || sessionUser.activeBusinessId || 'biz_default');

    // RBAC: must be OWNER/ADMIN of that business
    const membership = await prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId: sessionUser.userId, businessId } },
    });
    if (!membership) return res.redirect('/portal?oauth_error=not_a_member');
    const role = String(membership.role || '').toUpperCase();
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return res.redirect('/portal?oauth_error=forbidden');
    }

    const locationIdInternal = String(ctx.locationId || (await getDefaultLocationId()));

    console.log('Exchanging authorization code for tokens...');

    // Exchange authorization code for tokens
    const tokens = await getTokensFromCode(code as string);

    if (!tokens.refresh_token) {
      console.error('No refresh token received from Google');
      return res.redirect('/?oauth_error=no_refresh_token_received');
    }

    // Persist encrypted refresh token to DB (per business/location)
    await prisma.googleCredential.upsert({
      where: { locationId_provider: { locationId: locationIdInternal, provider: 'google_gbp' } },
      create: {
        businessId,
        locationId: locationIdInternal,
        provider: 'google_gbp',
        refreshTokenEnc: encryptString(tokens.refresh_token),
        accessTokenEnc: tokens.access_token ? encryptString(tokens.access_token) : null,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      update: {
        businessId,
        refreshTokenEnc: encryptString(tokens.refresh_token),
        accessTokenEnc: tokens.access_token ? encryptString(tokens.access_token) : null,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    console.log('✓ OAuth flow completed successfully. Refresh token saved.');

    // Redirect to success page
    res.redirect('/portal?oauth_success=true');
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    
    let errorMessage = 'unknown_error';
    if (error.message) {
      if (error.message.includes('invalid_grant')) {
        errorMessage = 'authorization_code_expired_or_invalid';
      } else if (error.message.includes('invalid_client')) {
        errorMessage = 'invalid_oauth_credentials';
      } else {
        errorMessage = encodeURIComponent(error.message);
      }
    }
    
    res.redirect(`/portal?oauth_error=${errorMessage}`);
  }
});

/**
 * GET /api/auth/google/status
 * Check if Google is connected (has valid refresh token)
 */
router.get('/google/status', async (req, res) => {
  try {
    const user = requireSessionUser(req);
    const businessId = String((req.query as any)?.businessId || user.activeBusinessId || 'biz_default');
    const locationIdInternal = String((req.query as any)?.locationId || (await getDefaultLocationId()));

    const row = await prisma.googleCredential.findFirst({
      where: { businessId, locationId: locationIdInternal, provider: 'google_gbp' },
    });
    
    res.json({
      connected: !!row,
      businessId,
      locationId: locationIdInternal,
      hasRefreshToken: !!row?.refreshTokenEnc,
      hasAccessToken: !!row?.accessTokenEnc,
      tokenExpiry: row?.expiryDate ? row.expiryDate.toISOString() : null,
      message: row ? 'Google Business Profile is connected' : 'Google Business Profile is not connected',
    });
  } catch (error: any) {
    console.error('Failed to check OAuth status:', error);
    res.status(500).json({ 
      error: 'Failed to check status', 
      message: error.message,
      connected: false,
    });
  }
});

/**
 * POST /api/auth/google/disconnect
 * Remove stored tokens (for future use)
 */
router.post('/google/disconnect', async (req, res) => {
  try {
    const user = requireSessionUser(req);
    const businessId = String((req.body as any)?.businessId || user.activeBusinessId || 'biz_default');
    const locationIdInternal = String((req.body as any)?.locationId || (await getDefaultLocationId()));

    const membership = await prisma.businessMembership.findUnique({
      where: { userId_businessId: { userId: user.userId, businessId } },
    });
    if (!membership || !['OWNER', 'ADMIN'].includes(String(membership.role).toUpperCase())) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.googleCredential.deleteMany({
      where: { businessId, locationId: locationIdInternal, provider: 'google_gbp' },
    });
    
    res.json({
      success: true,
      message: 'Google connection disconnected. You can reconnect anytime.',
    });
  } catch (error: any) {
    console.error('Failed to disconnect:', error);
    res.status(500).json({ 
      error: 'Failed to disconnect', 
      message: error.message 
    });
  }
});

export default router;
