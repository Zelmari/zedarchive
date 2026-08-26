import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      BETTER_AUTH_SECRET: 'test_secret_0123456789abcdef0123456789abcdef',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
  },
});
