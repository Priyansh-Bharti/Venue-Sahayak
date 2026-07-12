/**
 * scripts/env-check.js
 *
 * Pre-deploy guard: verifies all required environment variables are present.
 * Run via: npm run env:check  (called automatically by the `predeploy` hook)
 *
 * Exits with code 1 and a clear message listing all missing variables.
 * Exits with code 0 (silent) if everything is in order.
 */

// Load .env file if present (local dev convenience).
try {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const envPath = resolve(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (key && !(key in process.env)) {
            process.env[key] = value;
        }
    }
} catch {
    // No .env file — rely on environment variables already being set.
}

// --- Required variables ---
// GEMINI_API_KEY is managed by Firebase Secret Manager and will not be in process.env
// during a local env:check. We check for the others only; the secret is validated at
// Firebase deploy time by the Secret Manager binding.
const REQUIRED_CONFIG = [
    'GEMINI_MODEL',
    'FIREBASE_PROJECT_ID',
    'GOOGLE_MAPS_API_KEY',
    'ALLOWED_ORIGIN',
    'RATE_LIMIT_PER_MINUTE',
    'MAX_MESSAGE_LENGTH',
    'FUNCTIONS_MEMORY',
    'FUNCTIONS_TIMEOUT_SECONDS',
];

const missing = REQUIRED_CONFIG.filter((key) => !process.env[key]);

if (missing.length > 0) {
    console.error('\n[env:check] FAILED — The following required variables are not set:\n');
    missing.forEach((key) => console.error(`  ✗ ${key}`));
    console.error('\nCopy .env.example to .env and fill in the missing values before deploying.\n');
    process.exit(1);
}

console.log('[env:check] All required environment variables are present. Ready to deploy.');
