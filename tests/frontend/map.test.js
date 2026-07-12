/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('map.js (Frontend Logic)', () => {
    let mapJsContent;

    beforeAll(() => {
        mapJsContent = fs.readFileSync(path.resolve(process.cwd(), 'public', 'js', 'map.js'), 'utf8');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="map-container" class="absolute inset-0 bg-surface-container flex items-center justify-center p-6">
                <!-- Placeholder content -->
                <span>Map placeholder</span>
            </div>
        `;
        
        // Mock google maps global
        const mockPanTo = jest.fn();
        const mockSetZoom = jest.fn();
        const mockSetMap = jest.fn();
        const mockSetContent = jest.fn();
        const mockOpen = jest.fn();
        const mockAddListener = jest.fn((event, callback) => {
            if (event === 'click') {
                // Store click handler to simulate clicks if needed
                global.mockMarkerClick = callback;
            }
        });

        global.google = {
            maps: {
                Map: jest.fn().mockImplementation(() => ({
                    panTo: mockPanTo,
                    setZoom: mockSetZoom
                })),
                Marker: jest.fn().mockImplementation(() => ({
                    setMap: mockSetMap,
                    addListener: mockAddListener
                })),
                InfoWindow: jest.fn().mockImplementation(() => ({
                    setContent: mockSetContent,
                    open: mockOpen
                }))
            }
        };

        // Stub window.__ENV__ as would be provided by env-config.js at build time
        global.window.__ENV__ = {
            GOOGLE_MAPS_API_KEY: 'test-fake-maps-key-do-not-use'
        };

        // Reset the dynamic script injection to avoid actual network requests in tests
        const originalAppendChild = document.head.appendChild;
        document.head.appendChild = jest.fn((el) => {
            if (el.tagName === 'SCRIPT' && el.src.includes('maps.googleapis.com')) {
                // Simulate successful load by calling the callback
                setTimeout(() => window.initMap(), 0);
            } else {
                originalAppendChild.call(document.head, el);
            }
        });
    });

    it('injects google maps script dynamically', () => {
        eval(mapJsContent);
        expect(document.head.appendChild).toHaveBeenCalled();
        const scriptEl = document.head.appendChild.mock.calls[0][0];
        expect(scriptEl.tagName).toBe('SCRIPT');
        expect(scriptEl.src).toContain('maps.googleapis.com/maps/api/js');
        // Key is now injected from window.__ENV__.GOOGLE_MAPS_API_KEY (set by env-config.js at build time)
        expect(scriptEl.src).toContain('test-fake-maps-key-do-not-use');
    });

    it('initializes map on the container and clears placeholder', async () => {
        eval(mapJsContent);
        
        // Wait for simulated load
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const container = document.getElementById('map-container');
        expect(container.innerHTML).toBe('');
        expect(container.className).toBe('absolute inset-0');
        expect(global.google.maps.Map).toHaveBeenCalledWith(container, expect.objectContaining({
            zoom: 17,
            disableDefaultUI: true
        }));
    });

    it('renders fallback error message when map load fails', () => {
        // Prevent auto-success
        document.head.appendChild.mockImplementationOnce((el) => {
            // Trigger onerror instead
            el.onerror();
        });
        
        eval(mapJsContent);
        
        const container = document.getElementById('map-container');
        expect(container.innerHTML).toContain('Map Unavailable');
        expect(container.innerHTML).toContain('cloud_off');
    });

    it('renderZoneOnMap creates a marker, info window, and pans', async () => {
        eval(mapJsContent);
        await new Promise(resolve => setTimeout(resolve, 10)); // wait for init
        
        const zone = { name: 'Stage A', type: 'stage', crowd_level: 'high', lat: 10, lng: 20 };
        window.renderZoneOnMap(zone);
        
        // Verify Marker
        expect(global.google.maps.Marker).toHaveBeenCalledWith(expect.objectContaining({
            position: { lat: 10, lng: 20 },
            title: 'Stage A - high crowd level',
            icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
        }));

        // Verify InfoWindow content shape
        const infoWindowInstance = global.google.maps.InfoWindow.mock.results[0].value;
        expect(infoWindowInstance.setContent).toHaveBeenCalled();
        const contentArg = infoWindowInstance.setContent.mock.calls[0][0];
        expect(contentArg).toContain('Stage A');
        expect(contentArg).toContain('Type: stage');
        expect(contentArg).toContain('Crowd Level');
        expect(contentArg).toContain('high');
        
        // Verify pan and zoom
        const mapInstance = global.google.maps.Map.mock.results[0].value;
        expect(mapInstance.panTo).toHaveBeenCalledWith({ lat: 10, lng: 20 });
        expect(mapInstance.setZoom).toHaveBeenCalledWith(18);
    });

    it('renderZoneOnMap replaces existing marker when called multiple times', async () => {
        eval(mapJsContent);
        await new Promise(resolve => setTimeout(resolve, 10)); 
        
        const zone1 = { name: 'Gate 1', type: 'gate', crowd_level: 'low', lat: 10, lng: 20 };
        window.renderZoneOnMap(zone1);
        
        const firstMarker = global.google.maps.Marker.mock.results[0].value;
        
        const zone2 = { name: 'Gate 2', type: 'gate', crowd_level: 'medium', lat: 11, lng: 21 };
        window.renderZoneOnMap(zone2);
        
        // The first marker should be cleared
        expect(firstMarker.setMap).toHaveBeenCalledWith(null);
        
        // A second marker should have been created
        expect(global.google.maps.Marker).toHaveBeenCalledTimes(2);
    });
});
