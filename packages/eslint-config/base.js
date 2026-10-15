import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// Every package: ESLint and typescript-eslint recommended rules.
export const config = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      // A leading underscore marks a deliberately unused binding (e.g. Express's 4-arg error handler).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Noisy here: sanitisers strip control characters on purpose.
      "no-control-regex": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
