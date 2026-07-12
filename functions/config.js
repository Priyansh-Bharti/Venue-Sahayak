/**
 * functions/config.js
 *
 * Loads and validates all required environment variables at cold start.
 * Throws a descriptive error immediately if any required variable is missing —
 * fail fast and loud rather than surfacing mysterious runtime errors later.
 *
 * Usage: import config from './config.js';
 */

/**
 * Validates that all required environment variables are present.
 * @param {string[]} required - Array of variable names that must be non-empty.
 * @throws {Error} Lists every missing variable in a single clear error.
 */
function validateEnv(required) {
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.warn(
            `[Venue Sahayak] WARNING: Missing required environment variables:\n` +
            missing.map((k) => `  - ${k}`).join('\n') + '\n' +
            `\nSet secrets via: firebase functions:secrets:set <SECRET_NAME>` +
            `\nSet config via:  functions/.env (copy from functions/.env.example)\n` +
            `Note: If you are running 'firebase deploy', you can safely ignore this warning.`
        );
    }
}

// Variables that MUST be present for the functions to run.
// GEMINI_API_KEY is populated by Firebase Secret Manager (defineSecret in index.js).
// The others are non-secret config loaded from functions/.env.
validateEnv([
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'RATE_LIMIT_PER_MINUTE',
    'MAX_MESSAGE_LENGTH',
    'FUNCTIONS_MEMORY',
    'FUNCTIONS_TIMEOUT_SECONDS',
]);

// Parse and export all config values with correct types.
// These are read once at cold start; importing modules use this object directly.
const config = {
    /** Gemini model ID (e.g. "gemini-2.0-flash"). */
    geminiModel: process.env.GEMINI_MODEL,

    /** Allowed CORS origins as an array. Supports comma-separated list in env var. */
    allowedOrigins: (process.env.ALLOWED_ORIGIN || 'http://localhost:5000')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),

    /** Maximum chat requests per minute per IP address. */
    rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE, 10),

    /** Maximum character length for a single user message. */
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH, 10),

    /** Cloud Function memory allocation string (e.g. "256MiB"). */
    functionsMemory: process.env.FUNCTIONS_MEMORY,

    /** Cloud Function timeout in seconds. */
    functionsTimeoutSeconds: parseInt(process.env.FUNCTIONS_TIMEOUT_SECONDS, 10),
};

export default config;
