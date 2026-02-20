import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    watch: {
      usePolling: true,
      interval: 500
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
