#!/bin/bash
# Quick test script to verify API access

cd "$(dirname "$0")/.."

echo "Testing Google Business Profile API access..."
echo ""

# Load .env
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Try to get token (this will use refresh token if available)
NODE_PATH=. node -e "
require('ts-node/register');
require('dotenv').config();
const { getAccessToken } = require('./src/services/googleAuth');

getAccessToken()
  .then(token => {
    console.log('✓ Access token obtained');
    console.log('Token preview:', token.substring(0, 30) + '...');
    console.log('');
    console.log('Testing API endpoint...');
    const https = require('https');
    const options = {
      hostname: 'mybusiness.googleapis.com',
      path: '/v4/accounts',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    };
    const req = https.request(options, (res) => {
      console.log('Status:', res.statusCode);
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ API call successful!');
          try {
            const json = JSON.parse(data);
            console.log('Response:', JSON.stringify(json, null, 2));
          } catch (e) {
            console.log('Response:', data.substring(0, 500));
          }
        } else {
          console.log('✗ API call failed');
          console.log('Response:', data.substring(0, 1000));
        }
      });
    });
    req.on('error', (e) => {
      console.error('Request error:', e.message);
    });
    req.end();
  })
  .catch(err => {
    console.error('✗ Error getting token:', err.message);
    process.exit(1);
  });
"

