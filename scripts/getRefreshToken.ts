import dotenv from 'dotenv';
import { getAuthUrl, getTokensFromCode } from '../src/services/googleAuth';
import * as readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const main = async () => {
  console.log('='.repeat(80));
  console.log('Google OAuth Refresh Token Setup');
  console.log('='.repeat(80));
  console.log();

  try {
    // Generate authorization URL
    const authUrl = getAuthUrl();
    console.log('Step 1: Authorize the application');
    console.log('-'.repeat(80));
    console.log('Open this URL in your browser:');
    console.log();
    console.log(authUrl);
    console.log();
    console.log(
      'You will be asked to sign in and grant permissions to access Google Business Profile.'
    );
    console.log();

    // Get authorization code
    const code = await question('Step 2: Enter the authorization code from the callback URL: ');

    if (!code.trim()) {
      console.error('No authorization code provided');
      process.exit(1);
    }

    console.log();
    console.log('Exchanging authorization code for tokens...');

    // Exchange code for tokens
    const tokens = await getTokensFromCode(code.trim());

    if (!tokens.refresh_token) {
      console.error();
      console.error('✗ Error: No refresh token received.');
      console.error('This can happen if:');
      console.error('  1. You already authorized this app before (revoke access and try again)');
      console.error('  2. The prompt=consent parameter wasn\'t included');
      console.error();
      console.error('Try revoking access at: https://myaccount.google.com/permissions');
      console.error('Then run this script again.');
      process.exit(1);
    }

    console.log();
    console.log('✓ Success! Tokens saved.');
    console.log('-'.repeat(80));
    console.log('Add this to your .env file:');
    console.log();
    console.log(`GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log();

    if (tokens.access_token) {
      console.log(
        'Note: Access token is stored in data/google-tokens.json and will be auto-refreshed.'
      );
    }

    console.log();
    console.log('Your refresh token will be used automatically to get fresh access tokens.');
    console.log('You can now use the application without manually refreshing tokens.');
  } catch (error: any) {
    console.error();
    console.error('✗ Error:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('redirect_uri_mismatch')) {
      console.error();
      console.error('Fix: Go to Google Cloud Console → Credentials → Your OAuth Client');
      console.error('     Add this exact redirect URI: http://localhost:3000/oauth2callback');
    } else if (error.message.includes('invalid_grant')) {
      console.error();
      console.error('Fix: The authorization code expired or was already used.');
      console.error('     Run this script again and use a fresh code immediately.');
    } else if (error.message.includes('invalid_client')) {
      console.error();
      console.error('Fix: Check your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
      console.error('     Make sure they match your Google Cloud Console credentials.');
    } else if (error.message.includes('access_denied')) {
      console.error();
      console.error('Fix: Make sure you added yourself as a test user in OAuth consent screen.');
    }
    
    console.error();
    console.error('For more help, see TROUBLESHOOTING_OAUTH.md');
    
    if (error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
};

main();

