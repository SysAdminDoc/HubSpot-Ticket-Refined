import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        GM_addStyle: "readonly",
        GM_getValue: "readonly",
        GM_registerMenuCommand: "readonly",
        GM_setValue: "readonly",
      },
      sourceType: "script",
    },
    rules: {
      "no-console": "error",
      "no-undef": "error",
      "no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
      "prefer-const": "error"
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
      },
      sourceType: "module",
    },
    rules: {
      "no-console": "off",
      "no-undef": "error",
      "no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
      "prefer-const": "error"
    },
  },
];
