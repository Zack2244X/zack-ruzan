import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/",
      "coverage/",
      "**/*.bundle.js",
      "**/*.min.js"
    ],
  },
  
  // Backend config
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-unused-vars": "warn",
      "no-useless-escape": "warn",
      "no-undef": "warn",
      "no-restricted-properties": [
        "warn",
        {
          "property": "innerHTML",
          "message": "Use sanitizeHTML or textContent to prevent XSS."
        },
        {
          "property": "outerHTML",
          "message": "Use DOM element features safely."
        }
      ]
    },
  },
  
  // Backend test config
  {
    files: ["__tests__/**/*.js", "utils/test-*.js", "checkQuizzes.js"],
    languageOptions: {
        globals: {
            ...globals.jest,
            ...globals.node,
        }
    },
    rules: {
      "no-console": "off",
    }
  },

  // Frontend config (if they lint it from here)
  {
    files: ["../client/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-unused-vars": "warn",
      "no-undef": "warn",
      "no-restricted-properties": [
        "error",
        {
          "property": "innerHTML",
          "message": "Use sanitizeHTML or textContent to prevent XSS."
        },
        {
          "property": "outerHTML",
          "message": "Use DOM element features safely."
        }
      ]
    },
  },
];
