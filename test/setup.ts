import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  // Avoid accidental network usage in unit tests
  process.env.OPENAI_API_KEY = '';
  process.env.SERPAPI_KEY = '';
  process.env.GOOGLE_ACCOUNT_ID = 'accounts/123';
  process.env.GOOGLE_LOCATION_ID = 'locations/456';
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});



