/**
 * Venue Sahayak - Volunteer Admin Panel Logic
 * Handles real-time crowd density updates via Firebase Cloud Functions.
 */

const PROJECT_ID = 'p2-o-fcb5d';
const tbody = document.getElementById('zones-tbody');
let zonesData = [];

// Require a non-empty volunteer name for the session
let volunteerName = sessionStorage.getItem('volunteerName');
if (!volunteerName) {
    volunteerName = prompt("Enter your volunteer name to authorize updates:")?.trim();
    if (volunteerName) sessionStorage.setItem('volunteerName', volunteerName);
}

// Initial load and periodic refresh for relative timestamps
loadZones();
setInterval(updateTimestamps, 60000);

/**
 * Fetches zones from Firestore REST API (no heavy SDK required).
 */
async function loadZones() {
    try {
        const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/zones`);
        if (!res.ok) throw new Error('Failed to fetch zones');
        const data = await res.json();
        
        zonesData = (data.documents || []).map(doc => ({
            id: doc.name.split('/').pop(),
            name: doc.fields.name?.stringValue || 'Unknown Zone',
            type: doc.fields.type?.stringValue || 'gate',
            crowd_level: doc.fields.crowd_level?.stringValue || 'low',
            updated_at: doc.fields.updated_at?.timestampValue || null
        }));
        
        renderTable();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-error">Failed to load zones. Check your connection.</td></tr>`;
    }
}

/**
 * Renders the zone data into the HTML table structure matching the Stitch design.
 */
function renderTable() {
    tbody.innerHTML = zonesData.map(z => `
        <tr class="hover:bg-surface-container/30 transition-colors" data-id="${z.id}">
            <td class="px-6 py-5">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-surface-variant flex items-center justify-center">
                        <span class="material-symbols-outlined">${getIconForType(z.type)}</span>
                    </div>
                    <span class="font-body-lg font-medium text-on-surface">${z.name}</span>
                </div>
            </td>
            <td class="px-6 py-5">
                <div class="flex items-center bg-surface-container rounded-full p-1 w-fit border border-outline-variant/30">
                    ${['low', 'medium', 'high'].map(level => `
                        <button class="flex items-center gap-2 px-4 h-10 rounded-full font-label-lg transition-all active:scale-95 ${
                            z.crowd_level === level 
                            ? 'segmented-control-active bg-primary text-white' 
                            : 'text-on-surface-variant hover:bg-surface-container-high'
                        }" onclick="updateDensity('${z.id}', '${level}')" aria-pressed="${z.crowd_level === level}" aria-label="Set crowd level to ${level}">
                            <span class="material-symbols-outlined text-[20px]">${getIconForLevel(level)}</span>
                            ${level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                    `).join('')}
                </div>
            </td>
            <td class="px-6 py-5">
                <span class="timestamp text-on-surface-variant font-body-md" data-time="${z.updated_at || ''}">
                    ${timeAgo(z.updated_at)}
                </span>
            </td>
        </tr>
    `).join('');
}

/**
 * Optimistically updates crowd level, posting to backend and rolling back on failure.
 */
window.updateDensity = async function(zoneId, level) {
    if (!volunteerName) {
        alert("You must provide a volunteer name. Refresh the page to log in.");
        return;
    }

    const zone = zonesData.find(z => z.id === zoneId);
    if (!zone || zone.crowd_level === level) return;
    
    const oldLevel = zone.crowd_level;
    const oldTime = zone.updated_at;
    
    // Optimistic UI Update
    zone.crowd_level = level;
    zone.updated_at = new Date().toISOString();
    renderTable(); // Instant reflection

    try {
        const res = await fetch('/updateCrowdLevel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zoneId, level, updatedBy: volunteerName })
        });
        
        if (!res.ok) throw new Error('Update failed on server');
    } catch (e) {
        // Rollback
        zone.crowd_level = oldLevel;
        zone.updated_at = oldTime;
        renderTable();
        alert(`Failed to update ${zone.name}. Please try again.`);
    }
};

// --- View Helpers ---

function getIconForType(type) {
    const icons = { gate: 'sensor_door', washroom: 'wc', food: 'restaurant', stage: 'theater_comedy', medical: 'local_hospital', parking: 'local_parking' };
    return icons[type] || 'place';
}

function getIconForLevel(level) {
    return { low: 'check_circle', medium: 'priority_high', high: 'warning' }[level];
}

function timeAgo(isoString) {
    if (!isoString) return 'Never';
    const diffMins = Math.floor((new Date() - new Date(isoString)) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
    return 'Over a day ago';
}

function updateTimestamps() {
    document.querySelectorAll('.timestamp').forEach(el => {
        const ts = el.getAttribute('data-time');
        if (ts) el.textContent = timeAgo(ts);
    });
}
