import googleConfig from 'eslint-config-google';

export default [
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
    },
    rules: {
      ...googleConfig.rules,
      "require-jsdoc": "off"
    }
  }
];
