import { OAuth2Client } from 'google-auth-library';

export interface GoogleLoginUser {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

const getLoginOAuthClient = (): OAuth2Client => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_LOGIN_REDIRECT_URI ||
    'http://localhost:3000/api/auth/login/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
};

export const getGoogleLoginUrl = (state: string): string => {
  const client = getLoginOAuthClient();
  return client.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state,
  });
};

export const exchangeCodeForLoginUser = async (code: string): Promise<GoogleLoginUser> => {
  const client = getLoginOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new Error('No id_token returned from Google. Check OAuth scopes include openid.');
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error('Invalid ID token payload');

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
};



