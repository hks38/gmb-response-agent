import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Avoid reading the real project .env (often sandbox-blocked / contains secrets).
  // Vite will load env files from this directory instead.
  envDir: 'test/env',
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Avoid cross-test-file mock interference (we rely heavily on per-file mocks).
    isolate: true,
    fileParallelism: false,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
  },
});


