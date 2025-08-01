module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true, // Para Electron y Node.js APIs
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    // Tus reglas personalizadas aquí
    'no-unused-vars': 'warn',
    'no-console': 'off', // Permitir console.log para depuración
  },
};