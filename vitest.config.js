import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['client/js/sanitize.js', 'client/js/modules/auth.js'],
      thresholds: {
        global: {
          statements: 50,
          branches: 50,
          functions: 50,
          lines: 50
        }
      }
    },
    include: ['tests/frontend/**/*.test.js', 'src/**/*.test.js']
  }
});
