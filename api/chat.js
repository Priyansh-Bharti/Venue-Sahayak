import { getGeminiResponse } from "./lib/gemini.js";
import config from "./lib/config.js";

// In-memory rate limiting map for 'chat' endpoint
const ipRequestCounts = new Map();

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
        return res.status(415).json({ error: "Unsupported Media Type. Expected application/json." });
    }

    // Rate Limiting (10 requests / minute / IP)
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const rateLimitData = ipRequestCounts.get(clientIp) || { count: 0, startTime: now };

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
        console.error(`[chat endpoint] Error processing request for IP ${clientIp}:`, {
            errorMessage: error.message,
            stack: error.stack,
            status: error.status
        });

        const statusCode = error.status || 500;
        const safeMessage = statusCode >= 500 ? "Internal Server Error" : error.message;

        return res.status(statusCode).json({ error: safeMessage });
    }
}
