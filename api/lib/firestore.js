/**
 * api/lib/firestore.js
 *
 * Firestore access via the REST API — no firebase-admin SDK needed.
 * This works on any serverless platform (Vercel, Netlify, etc.) without
 * Application Default Credentials.
 *
 * Authentication: Firestore Security Rules are used to control access.
 * Reads are public; writes are restricted to valid crowd level values via rules.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'p2-o-fcb5d';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * Converts a Firestore REST API document to a plain JS object.
 */
function fromFirestoreDoc(doc) {
    const id = doc.name.split('/').pop();
    const data = {};
    for (const [key, val] of Object.entries(doc.fields || {})) {
        // Extract the typed value from Firestore's field format
        if ('stringValue' in val) data[key] = val.stringValue;
        else if ('integerValue' in val) data[key] = parseInt(val.integerValue, 10);
        else if ('doubleValue' in val) data[key] = val.doubleValue;
        else if ('booleanValue' in val) data[key] = val.booleanValue;
        else if ('timestampValue' in val) data[key] = val.timestampValue;
        else if ('nullValue' in val) data[key] = null;
        else data[key] = val;
    }
    return { id, ...data };
}

/**
 * Retrieves all zones from Firestore.
 */
export async function getAllZones() {
    const res = await fetch(`${BASE_URL}/zones`);
    if (!res.ok) {
        throw new Error(`Firestore getAllZones failed: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    if (!json.documents) return [];
    return json.documents.map(fromFirestoreDoc);
}

/**
 * Retrieves a zone by its name using case-insensitive matching.
 */
export async function getZoneByName(name) {
    if (!name || typeof name !== 'string') {
        throw new Error('Invalid zone name provided.');
    }
    const zones = await getAllZones();
    const searchName = name.toLowerCase().trim();

    // Exact match first
    let match = zones.find(z => typeof z.name === 'string' && z.name.toLowerCase().trim() === searchName);
    // Fuzzy substring match
    if (!match) {
        match = zones.find(z =>
            typeof z.name === 'string' &&
            z.name.trim() !== '' &&
            (z.name.toLowerCase().includes(searchName) || searchName.includes(z.name.toLowerCase()))
        );
    }
    return match || null;
}

/**
 * Updates the crowd level for a specific zone using Firestore REST PATCH.
 */
export async function updateZoneCrowdLevel(zoneId, level, updatedBy) {
    const allowedLevels = ['low', 'medium', 'high'];
    if (!allowedLevels.includes(level)) {
        throw new TypeError(`Invalid crowd level: "${level}". Must be one of: ${allowedLevels.join(', ')}`);
    }
    if (!zoneId || !updatedBy) {
        throw new Error('zoneId and updatedBy are required to update crowd level.');
    }

    const docPath = `${BASE_URL}/zones/${zoneId}`;
    const updateMask = 'updateMask.fieldPaths=crowd_level&updateMask.fieldPaths=updated_by&updateMask.fieldPaths=updated_at';
    const url = `${docPath}?${updateMask}`;

    const body = {
        fields: {
            crowd_level: { stringValue: level },
            updated_by: { stringValue: updatedBy },
            updated_at: { timestampValue: new Date().toISOString() }
        }
    };

    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Firestore update failed: ${res.status} ${text}`);
    }
}

// Keep testing hook compatible
export function _setDbForTesting() {
    // No-op on REST implementation; tests mock fetch instead
}
