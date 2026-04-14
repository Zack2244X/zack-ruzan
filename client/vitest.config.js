import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["client/tests/**/*.test.js"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["client/js/modules/**/*.js"],
      thresholds: {
        lines: 0.5,
        branches: 0.2,
        functions: 0.2,
        statements: 0.3,
      },
    },
  },
});
