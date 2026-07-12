import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';

// Ensure Firebase Admin is initialized
if (!getApps().length) {
    initializeApp();
}

let db = getFirestore();

// Exported for testing purposes only
export function _setDbForTesting(mockDb) {
    db = mockDb;
}

/**
 * Retrieves all zones from Firestore.
 * 
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of zone objects.
 * @throws {Error} Throws an error if the database query fails.
 */
export async function getAllZones() {
    try {
        const snapshot = await db.collection('zones').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error in getAllZones:', error);
        throw new Error(`Failed to retrieve all zones: ${error.message}`);
    }
}

/**
 * Retrieves a zone by its name using a case-insensitive fuzzy match.
 * Fetches all zones and filters in memory since the collection is minimal.
 * 
 * @param {string} name - The name of the zone to search for.
 * @returns {Promise<Object|null>} A promise that resolves to the matched zone object, or null if not found.
 * @throws {Error} Throws an error if the retrieval or matching process fails.
 */
export async function getZoneByName(name) {
    if (!name || typeof name !== 'string') {
        throw new Error('Invalid zone name provided.');
    }
    try {
        // Fetch all zones to perform case-insensitive and slightly fuzzy matching
        const snapshot = await db.collection('zones').get();
        const zones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const searchName = name.toLowerCase().trim();
        
        // Exact case-insensitive match first
        let matchedZone = zones.find(z => typeof z.name === 'string' && z.name.toLowerCase().trim() === searchName);
        
        if (!matchedZone) {
            // Basic fuzzy match (e.g., if searchName is a substring of zone name)
            matchedZone = zones.find(z => 
                typeof z.name === 'string' && z.name.trim() !== '' && (z.name.toLowerCase().includes(searchName) || searchName.includes(z.name.toLowerCase()))
            );
        }
        
        return matchedZone || null;
    } catch (error) {
        console.error(`Error in getZoneByName for name "${name}":`, error);
        throw new Error(`Failed to retrieve zone by name: ${error.message}`);
    }
}

/**
 * Updates the crowd level for a specific zone.
 * 
 * @param {string} zoneId - The unique ID of the zone to update.
 * @param {string} level - The new crowd level ('low', 'medium', or 'high').
 * @param {string} updatedBy - The volunteer name or ID making the update.
 * @returns {Promise<void>} A promise that resolves when the update is complete.
 * @throws {TypeError} Throws a TypeError if the level is not one of the allowed enum values.
 * @throws {Error} Throws an error if the database update fails or if required arguments are missing.
 */
export async function updateZoneCrowdLevel(zoneId, level, updatedBy) {
    const allowedLevels = ['low', 'medium', 'high'];
    
    if (!allowedLevels.includes(level)) {
        throw new TypeError(`Invalid crowd level: "${level}". Must be one of: ${allowedLevels.join(', ')}`);
    }
    
    if (!zoneId || !updatedBy) {
        throw new Error('zoneId and updatedBy are required to update crowd level.');
    }

    try {
        const zoneRef = db.collection('zones').doc(zoneId);
        await zoneRef.update({
            crowd_level: level,
            updated_by: updatedBy,
            updated_at: FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error(`Error in updateZoneCrowdLevel for zoneId "${zoneId}":`, error);
        throw new Error(`Failed to update zone crowd level: ${error.message}`);
    }
}
