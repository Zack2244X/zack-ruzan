import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["client/tests/**/*.test.js"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["client/js/modules/**/*.js"],
      lines: 45,
      branches: 35,
      functions: 40,
      statements: 45,
    },
  },
});
