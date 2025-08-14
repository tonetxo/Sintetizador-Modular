const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
    },
  },
];