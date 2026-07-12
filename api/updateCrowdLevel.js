import { updateZoneCrowdLevel } from "./lib/firestore.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
        return res.status(415).json({ error: "Unsupported Media Type. Expected application/json." });
    }

    try {
        const { zoneId, level, updatedBy } = req.body || {};

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
        console.error(`[updateCrowdLevel endpoint] Error updating zone:`, {
            errorMessage: error.message,
            stack: error.stack
        });

        return res.status(500).json({ error: "Internal Server Error. Failed to update crowd level." });
    }
}
