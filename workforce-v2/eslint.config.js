import globals from "globals";

export default [
  { ignores: ["dist/**"] },
  {
    files: ["src/**/*.{js,jsx}", "tests/**/*.js", "vite.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-dupe-keys": "error",
      "no-unreachable": "error",
    },
  },
];
