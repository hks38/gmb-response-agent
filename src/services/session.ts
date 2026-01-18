import crypto from 'crypto';

export interface SessionUser {
  userId: string; // internal DB user id
  email?: string;
  name?: string;
  picture?: string;
  activeBusinessId?: string;
}

interface SessionPayload extends SessionUser {
  iat: number;
  exp: number;
}

const base64UrlEncode = (buf: Buffer): string =>
  buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const base64UrlDecode = (s: string): Buffer => {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
    + '==='.slice((s.length + 3) % 4);
  return Buffer.from(padded, 'base64');
};

export const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('=') || '');
  }
  return out;
};

const getSessionSecret = (): string => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Dev-friendly fallback; in production, SESSION_SECRET must be set.
    return 'dev-session-secret-change-me';
  }
  return secret;
};

const sign = (data: string): string => {
  const h = crypto.createHmac('sha256', getSessionSecret());
  h.update(data);
  return base64UrlEncode(h.digest());
};

export const createSessionToken = (user: SessionUser, ttlSeconds = 60 * 60 * 24 * 7): string => {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...user,
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
};

export const verifySessionToken = (token: string): SessionUser | null => {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || now >= payload.exp) return null;
  if (!payload.userId) return null;

  const { userId, email, name, picture, activeBusinessId } = payload;
  return { userId, email, name, picture, activeBusinessId };
};

export const buildSetCookie = (name: string, value: string, opts?: {
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  secure?: boolean;
  path?: string;
}): string => {
  const parts: string[] = [];
  parts.push(`${name}=${encodeURIComponent(value)}`);
  parts.push(`Path=${opts?.path || '/'}`);
  if (typeof opts?.maxAgeSeconds === 'number') parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  if (opts?.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${opts?.sameSite || 'Lax'}`);
  if (opts?.secure) parts.push('Secure');
  return parts.join('; ');
};



