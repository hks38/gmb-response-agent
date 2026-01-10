import dotenv from 'dotenv';
import axios from 'axios';
import { getAccessToken } from '../src/services/googleAuth';

dotenv.config();

const main = async () => {
  try {
    const token = await getAccessToken();
    console.log('Token obtained\n');

    const endpoints = [
      'https://mybusiness.googleapis.com/v4/accounts',
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`Testing: ${endpoint}`);
        const res = await axios.get(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        });
        console.log(`✓ SUCCESS! Status: ${res.status}`);
        console.log('Response:', JSON.stringify(res.data, null, 2).substring(0, 500));
        console.log('\nThis endpoint works! Use it in the location ID script.\n');
        return;
      } catch (e: any) {
        const status = e.response?.status;
        const message = e.response?.data?.error?.message || e.message;
        console.log(`✗ Failed: ${status || 'No status'} - ${message}`);
        if (e.response?.data) {
          console.log('Response data:', JSON.stringify(e.response.data, null, 2).substring(0, 300));
        }
        console.log();
      }
    }

    console.log('None of the endpoints worked. APIs may not be enabled or need more time to activate.');
  } catch (e: any) {
    console.error('Error:', e.message);
  }
};

main();

