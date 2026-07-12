/**
 * Venue Sahayak - Map UI Implementation
 * Handles Google Maps initialization and zone rendering.
 */

// Configurable center for the venue. This example uses a default placeholder coordinate.
const VENUE_CENTER = { lat: 28.627, lng: 77.241 }; 

// GOOGLE_MAPS_API_KEY is injected at build time by scripts/inject-env.js into
// public/js/env-config.js (gitignored), which sets window.__ENV__.GOOGLE_MAPS_API_KEY.
// env-config.js is loaded by index.html/admin.html before this file.
//
// Security note: Maps API keys are client-exposed by design. The security control is
// HTTP referrer restriction on the key, NOT source obscurity:
//   Google Cloud Console > APIs & Services > Credentials > your Maps key
//   > Application restrictions > HTTP referrers
//   Restrict to: https://your-project.web.app/*
const MAPS_API_KEY = (window.__ENV__ && window.__ENV__.GOOGLE_MAPS_API_KEY) || '';

// Map State
let map;
let currentMarker;
let infoWindow;

// Initialize
loadGoogleMapsAPI();

/**
 * Injects the Google Maps script into the document dynamically.
 */
function loadGoogleMapsAPI() {
    window.initMap = initializeMap;

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&callback=initMap`;
    script.async = true;
    script.defer = true;
    script.onerror = handleMapLoadError;
    document.head.appendChild(script);
}

/**
 * Initializes the map instance on the map-container element.
 */
function initializeMap() {
    const container = document.getElementById('map-container');
    if (!container) return;

    // Remove the placeholder styling/image
    container.innerHTML = '';
    container.className = 'absolute inset-0';

    map = new google.maps.Map(container, {
        center: VENUE_CENTER,
        zoom: 17,
        disableDefaultUI: true, // Keep it clean per Stitch design
        zoomControl: true, // Allow user zooming
    });

    infoWindow = new google.maps.InfoWindow();
}

/**
 * Renders an error message inside the map container if the script fails.
 */
function handleMapLoadError() {
    const container = document.getElementById('map-container');
    if (!container) return;
    
    // Clear out placeholder image completely
    container.className = 'absolute inset-0 bg-surface-container flex items-center justify-center p-6';
    container.innerHTML = `
        <div class="text-center">
            <span class="material-symbols-outlined text-error text-[48px] mb-2" data-icon="cloud_off">cloud_off</span>
            <h4 class="text-title-lg text-on-surface mb-1">Map Unavailable</h4>
            <p class="text-body-md text-on-surface-variant max-w-sm">
                We couldn't load the interactive map due to a network or configuration issue.
            </p>
        </div>
    `;
}

/**
 * Maps the abstract crowd level to a specific Maps pin color URL.
 * @param {string} level - "low", "medium", or "high"
 * @returns {string} URL to the standard marker image
 */
function getMarkerIconUrl(level) {
    switch (level) {
        case 'low': return 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
        case 'medium': return 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
        case 'high': return 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
        default: return 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
    }
}

/**
 * Formats a clean, accessible InfoWindow content string.
 * Accessibility note: We render crowd_level as text since relying on color alone is non-accessible.
 * @param {Object} zone - The zone data object
 * @returns {string} HTML string for the InfoWindow
 */
function buildInfoWindowContent(zone) {
    return `
        <div style="padding: 4px; color: #191c1e; font-family: 'Inter', sans-serif;">
            <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">${zone.name}</h3>
            <p style="margin: 0; font-size: 14px; text-transform: capitalize;">Type: ${zone.type}</p>
            <p style="margin: 6px 0 0 0; font-size: 14px; font-weight: 500;">
                Crowd Level: <strong style="text-transform: capitalize;">${zone.crowd_level}</strong>
            </p>
        </div>
    `;
}

/**
 * Updates or creates a map marker for the specified zone.
 * Called globally by chat.js when a new zone is received from the backend.
 * @param {Object} zone - The zone data object
 */
window.renderZoneOnMap = function(zone) {
    if (!map || typeof google === 'undefined') {
        console.warn('Map not initialized yet. Cannot render zone.');
        return;
    }

    const position = { lat: zone.lat, lng: zone.lng };

    // Clear old marker if it exists
    if (currentMarker) {
        currentMarker.setMap(null);
    }

    // Place new marker with color-coded icon and accessible alt title
    currentMarker = new google.maps.Marker({
        position: position,
        map: map,
        title: `${zone.name} - ${zone.crowd_level} crowd level`,
        icon: getMarkerIconUrl(zone.crowd_level)
    });

    const contentString = buildInfoWindowContent(zone);
    
    // Attach click listener to marker
    currentMarker.addListener('click', () => {
        infoWindow.setContent(contentString);
        infoWindow.open(map, currentMarker);
    });

    // Auto-open window and pan map to the new zone
    infoWindow.setContent(contentString);
    infoWindow.open(map, currentMarker);
    map.panTo(position);
    map.setZoom(18); // Zoom in on the location
};
