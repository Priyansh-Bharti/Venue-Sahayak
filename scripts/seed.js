import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
// This uses application default credentials. If running locally, you might need to set
// process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
// or use a service account key if deploying against a live project.
initializeApp();
const db = getFirestore();

const zones = [
    {
        name: "North Gate Entry",
        type: "gate",
        lat: 28.6139,
        lng: 77.2090,
        crowd_level: "low",
        description: "Main entrance at the North side. Currently experiencing normal flow with minimal wait times.",
        updated_by: "system_seeder"
    },
    {
        name: "Food Court A",
        type: "food",
        lat: 28.6135,
        lng: 77.2105,
        crowd_level: "high",
        description: "Primary food court near the main plaza. Very busy right now, consider using alternative food stalls.",
        updated_by: "system_seeder"
    },
    {
        name: "Main Stage Area",
        type: "stage",
        lat: 28.6145,
        lng: 77.2085,
        crowd_level: "medium",
        description: "The primary performance area. Filling up quickly but space is still available near the back.",
        updated_by: "system_seeder"
    },
    {
        name: "West Wing Washrooms",
        type: "washroom",
        lat: 28.6140,
        lng: 77.2070,
        crowd_level: "low",
        description: "Restroom facilities on the west side. No significant lines at the moment.",
        updated_by: "system_seeder"
    },
    {
        name: "Medical Tent 1",
        type: "medical",
        lat: 28.6150,
        lng: 77.2095,
        crowd_level: "low",
        description: "First aid and medical assistance tent near the east exit. Fully operational.",
        updated_by: "system_seeder"
    },
    {
        name: "VIP Parking Zone",
        type: "parking",
        lat: 28.6125,
        lng: 77.2110,
        crowd_level: "medium",
        description: "Designated parking area for VIP ticket holders. At 60% capacity.",
        updated_by: "system_seeder"
    },
    {
        name: "East Gate Exit",
        type: "gate",
        lat: 28.6138,
        lng: 77.2120,
        crowd_level: "high",
        description: "Secondary gate on the east side. Experiencing heavy congestion as crowds leave the side stage.",
        updated_by: "system_seeder"
    }
];

async function seedZones() {
    console.log('Seeding zones collection...');
    try {
        const batch = db.batch();
        const zonesCollection = db.collection('zones');

        for (const zone of zones) {
            // Generate a document reference (Firestore auto-generates ID if we use doc() without args)
            const docRef = zonesCollection.doc();
            
            // Prepare document data
            const docData = {
                ...zone,
                updated_at: FieldValue.serverTimestamp()
            };
            
            batch.set(docRef, docData);
            console.log(`Prepared zone: ${zone.name}`);
        }

        await batch.commit();
        console.log(`Successfully seeded ${zones.length} zones.`);
        process.exit(0);
    } catch (error) {
        console.error('Error seeding zones:', error);
        process.exit(1);
    }
}

seedZones();
