/**
 * Venue Sahayak API endpoints
 * 
 * 1. chat (POST)
 *    - Input: { message: string }
 *    - Output: { reply: string, zone: { name, lat, lng, crowd_level } | null }
 *    - Rate limit: 10 requests/minute per IP 
 *      (TRADEOFF NOTE: An in-memory Map is used for rate limiting. In a multi-instance 
 *      Cloud Run environment, this is local to each container instance, meaning global rate limits 
 *      are not strictly enforced. For a minimal setup, this avoids the cost and latency of a Redis 
 *      or Firestore-based distributed counter, while still providing basic abuse protection).
 *    - Description: Receives natural language queries, calls the Gemini function-calling flow, and
 *      returns grounded, contextual answers with optional map zone data.
 * 
 * 2. updateCrowdLevel (POST)
 *    - Input: { zoneId: string, level: "low"|"medium"|"high", updatedBy: string }
 *    - Output: { success: true, updated_at: number }
 *    - Description: Updates the crowd level for a given zone. Validates input strictly. 
 *      Used by the volunteer admin dashboard.
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getGeminiResponse } from "./gemini.js";
import { updateZoneCrowdLevel } from "./firestore.js";
import config from "./config.js";

// Load Gemini API key securely from Google Cloud Secret Manager.
// defineSecret wires the secret into process.env.GEMINI_API_KEY at runtime.
// Never place this value in functions/.env or any committed file.
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Allowed CORS origins are loaded from ALLOWED_ORIGIN env var (comma-separated).
// Set in functions/.env for local dev; update for production Firebase Hosting domain.
// config.allowedOrigins is parsed and validated at cold start by config.js.
const ALLOWED_ORIGINS = config.allowedOrigins;

// 2nd Gen Function configuration.
// memory and timeoutSeconds are read from env vars (FUNCTIONS_MEMORY, FUNCTIONS_TIMEOUT_SECONDS)
// so they can be tuned per environment without touching source code.
const functionConfig = {
    memory: config.functionsMemory,
    timeoutSeconds: config.functionsTimeoutSeconds,
    cors: ALLOWED_ORIGINS,
    secrets: [geminiApiKey]
};

// In-memory rate limiting map for 'chat' endpoint
const ipRequestCounts = new Map();

/**
 * Helper to clean up old rate-limit entries to prevent memory leaks in long-lived instances.
 */
setInterval(() => {
    const oneMinuteAgo = Date.now() - 60000;
    for (const [ip, data] of ipRequestCounts.entries()) {
        if (data.startTime < oneMinuteAgo) {
            ipRequestCounts.delete(ip);
        }
    }
}, 60000).unref();

/**
 * Generic helper to validate request headers and content type.
 */
function validateRequest(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return false;
    }

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
        res.status(415).json({ error: "Unsupported Media Type. Expected application/json." });
        return false;
    }
    return true;
}

/**
 * 1. chat (POST)
 */
export const chat = onRequest(functionConfig, async (req, res) => {
    if (!validateRequest(req, res)) return;

    // Rate Limiting (10 requests / minute / IP)
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const rateLimitData = ipRequestCounts.get(clientIp) || { count: 0, startTime: now };

    // Reset window if it's been more than a minute
    if (now - rateLimitData.startTime > 60000) {
        rateLimitData.count = 0;
        rateLimitData.startTime = now;
    }

    if (rateLimitData.count >= config.rateLimitPerMinute) {
        console.warn(`[RateLimit] IP ${clientIp} exceeded ${config.rateLimitPerMinute} requests per minute.`);
        return res.status(429).json({ error: "Too Many Requests. Please try again later." });
    }

    rateLimitData.count += 1;
    ipRequestCounts.set(clientIp, rateLimitData);

    try {
        const { message } = req.body || {};

        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ error: "Bad Request. 'message' field is required and must be a string." });
        }

        const { text, zoneData } = await getGeminiResponse(message);

        // Sanitize zone object output (exclude internal IDs or extra fields)
        let sanitizedZone = null;
        if (zoneData && zoneData.status !== "not found") {
            sanitizedZone = {
                name: zoneData.name,
                lat: zoneData.lat,
                lng: zoneData.lng,
                crowd_level: zoneData.crowd_level
            };
        }

        return res.status(200).json({
            reply: text,
            zone: sanitizedZone
        });

    } catch (error) {
        // Structured server-side logging (Never log the raw stack to the client)
        console.error(`[chat endpoint] Error processing request for IP ${clientIp}:`, {
            errorMessage: error.message,
            stack: error.stack,
            status: error.status
        });

        // Map status codes for expected errors (like the 400 validation error from gemini.js)
        const statusCode = error.status || 500;
        const safeMessage = statusCode >= 500 ? "Internal Server Error" : error.message;

        return res.status(statusCode).json({ error: safeMessage });
    }
});

/**
 * 2. updateCrowdLevel (POST)
 */
export const updateCrowdLevel = onRequest(functionConfig, async (req, res) => {
    if (!validateRequest(req, res)) return;

    try {
        const { zoneId, level, updatedBy } = req.body || {};

        // Server-side strict validation
        if (!zoneId || typeof zoneId !== 'string' || zoneId.trim() === '') {
            return res.status(400).json({ error: "Bad Request. 'zoneId' is required and must be a string." });
        }
        if (!updatedBy || typeof updatedBy !== 'string' || updatedBy.trim() === '') {
            return res.status(400).json({ error: "Bad Request. 'updatedBy' is required and must be a string." });
        }
        
        const allowedLevels = ["low", "medium", "high"];
        if (!allowedLevels.includes(level)) {
            return res.status(400).json({ error: "Bad Request. 'level' must be 'low', 'medium', or 'high'." });
        }

        await updateZoneCrowdLevel(zoneId, level, updatedBy);

        return res.status(200).json({
            success: true,
            updated_at: Date.now()
        });

    } catch (error) {
        // Structured server-side logging
        console.error(`[updateCrowdLevel endpoint] Error updating zone:`, {
            errorMessage: error.message,
            stack: error.stack
        });

        return res.status(500).json({ error: "Internal Server Error. Failed to update crowd level." });
    }
});
