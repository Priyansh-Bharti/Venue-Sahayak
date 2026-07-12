/**
 * jest.setup.js
 *
 * Sets test-safe environment variable stubs for all test runs.
 * These values are obviously fake and are only used to satisfy config.js
 * validation at cold start during Jest execution.
 *
 * Real secrets are NEVER placed here. GEMINI_API_KEY is set to a clearly
 * fake placeholder so tests can import functions/gemini.js without error.
 */

// Secret — obviously fake, never a real key
process.env.GEMINI_API_KEY = 'test-fake-key-do-not-use';

// Non-secret config — mirrors functions/.env.example defaults
process.env.GEMINI_MODEL = 'gemini-2.0-flash';
process.env.ALLOWED_ORIGIN = 'http://localhost:5000';
process.env.RATE_LIMIT_PER_MINUTE = '10';
process.env.MAX_MESSAGE_LENGTH = '500';
process.env.FUNCTIONS_MEMORY = '256MiB';
process.env.FUNCTIONS_TIMEOUT_SECONDS = '30';
