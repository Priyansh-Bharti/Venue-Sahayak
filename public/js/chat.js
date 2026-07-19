/**
 * Venue Sahayak - Chat UI Implementation
 * Handles chat interactions, API requests, and voice input.
 */

// --- DOM Elements ---
const chatThread = document.getElementById('chat-thread');
const inputField = document.querySelector('input[type="text"]');
// Select the buttons via their icons
const sendBtn = document.querySelector('button .material-symbols-outlined[data-icon="send"]').parentElement;
const micBtn = document.querySelector('button .material-symbols-outlined[data-icon="mic"]').parentElement;

// --- Application State ---
let isProcessing = false;
let isRecording = false;

// --- Initialization ---
setupEventListeners();
initializeSpeechRecognition();

/**
 * Attaches user interaction event listeners.
 */
function setupEventListeners() {
    sendBtn.addEventListener('click', handleSend);
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });
}

// --- Gemini API Config (injected at build time by scripts/inject-env.js) ---
const GEMINI_API_KEY = window.__ENV__?.GEMINI_API_KEY || '';
const GEMINI_MODEL = window.__ENV__?.GEMINI_MODEL || 'gemini-2.0-flash';
const FIRESTORE_PROJECT = 'p2-o-fcb5d';

/**
 * Fetches all zones from Firestore REST API for context.
 */
async function fetchZones() {
    try {
        const res = await fetch(`https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/zones`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.documents || []).map(doc => ({
            name: doc.fields?.name?.stringValue || 'Unknown',
            type: doc.fields?.type?.stringValue || '',
            crowd_level: doc.fields?.crowd_level?.stringValue || 'low',
            description: doc.fields?.description?.stringValue || ''
        }));
    } catch { return []; }
}

/**
 * Handles message submission — calls Gemini API directly from browser.
 */
async function handleSend() {
    const text = inputField.value.trim();
    if (!text || isProcessing) return;

    if (!GEMINI_API_KEY) {
        appendAssistantMessage('Chat is not configured. API key missing.');
        return;
    }

    lockInputState();
    appendUserMessage(text);
    const indicatorId = appendTypingIndicator();

    try {
        // Fetch live zone data for context
        const zones = await fetchZones();
        const zoneContext = zones.length
            ? zones.map(z => `- ${z.name} (${z.type}): crowd level is ${z.crowd_level}. ${z.description}`).join('\n')
            : 'No zone data available currently.';

        const systemPrompt = `You are Venue Sahayak, a helpful AI assistant for stadium and venue events in India. 
You help attendees navigate the venue, check crowd levels, find facilities, and plan their experience.
Answer concisely and helpfully. If asked about a specific zone or gate, mention its crowd level.
Current live venue zone data:\n${zoneContext}`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text }] }]
            })
        });

        if (!response.ok) throw new Error(`Gemini error ${response.status}`);

        const data = await response.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not process that.';

        removeElement(indicatorId);
        appendAssistantMessage(reply);
        updateLanguage(reply);

        // Try to highlight a mentioned zone on the map
        const mentionedZone = zones.find(z => reply.toLowerCase().includes(z.name.toLowerCase()));
        if (mentionedZone && typeof window.renderZoneOnMap === 'function') {
            window.renderZoneOnMap(mentionedZone);
        }
    } catch (error) {
        removeElement(indicatorId);
        appendAssistantMessage('Something went wrong, please try again.');
    } finally {
        unlockInputState();
    }
}

/**
 * Locks the input field during processing to prevent double-submit.
 */
function lockInputState() {
    isProcessing = true;
    inputField.value = '';
    inputField.disabled = true;
}

/**
 * Unlocks the input field after processing completes.
 */
function unlockInputState() {
    isProcessing = false;
    inputField.disabled = false;
    inputField.focus();
}

/**
 * Escapes HTML characters to prevent XSS rendering.
 * @param {string} str - Raw user or server string
 * @returns {string} Safe string for insertion
 */
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Formats the current time (e.g., 14:05).
 * @returns {string} Time string
 */
function getCurrentTimeStr() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Appends a styled user message bubble.
 * @param {string} text - Message text
 */
function appendUserMessage(text) {
    const safeText = escapeHTML(text);
    const timeStr = getCurrentTimeStr();
    
    const html = `
        <div class="flex items-start gap-4 justify-end ml-12">
            <div class="bg-primary px-4 py-3 rounded-2xl rounded-tr-none shadow-sm">
                <p class="text-on-primary">${safeText}</p>
                <span class="text-[10px] text-primary-fixed/80 mt-1 block text-right">${timeStr}</span>
            </div>
            <div class="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-on-secondary-container text-[18px]" data-icon="person">person</span>
            </div>
        </div>
    `;
    
    chatThread.insertAdjacentHTML('beforeend', html);
    chatThread.scrollTop = chatThread.scrollHeight;
}

/**
 * Appends a styled assistant message bubble.
 * @param {string} text - Message text
 */
function appendAssistantMessage(text) {
    const safeText = escapeHTML(text);
    const timeStr = getCurrentTimeStr();
    
    const html = `
        <div class="flex items-start gap-4 mr-12">
            <div class="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-primary text-[18px]" data-icon="smart_toy">smart_toy</span>
            </div>
            <div class="bg-surface-container-high px-4 py-3 rounded-2xl rounded-tl-none shadow-sm">
                <p class="text-on-surface">${safeText}</p>
                <span class="text-[10px] text-outline mt-1 block">${timeStr}</span>
            </div>
        </div>
    `;
    
    chatThread.insertAdjacentHTML('beforeend', html);
    chatThread.scrollTop = chatThread.scrollHeight;
}

/**
 * Renders an animated typing indicator bubble.
 * @returns {string} ID of the indicator element
 */
function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const html = `
        <div id="${id}" class="flex items-start gap-4 mr-12">
            <div class="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-primary text-[18px]" data-icon="smart_toy">smart_toy</span>
            </div>
            <div class="bg-surface-container-high px-4 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1" aria-label="Assistant is typing..." role="status">
                <span class="w-2 h-2 bg-outline rounded-full animate-pulse"></span>
                <span class="w-2 h-2 bg-outline rounded-full animate-pulse" style="animation-delay: 150ms"></span>
                <span class="w-2 h-2 bg-outline rounded-full animate-pulse" style="animation-delay: 300ms"></span>
            </div>
        </div>
    `;
    
    chatThread.insertAdjacentHTML('beforeend', html);
    chatThread.scrollTop = chatThread.scrollHeight;
    return id;
}

/**
 * Removes a specific DOM element by ID.
 * @param {string} id - Element ID
 */
function removeElement(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Detects common languages based on character scripts and sets the html lang attribute.
 * @param {string} text - The response text
 */
function updateLanguage(text) {
    let lang = 'en';
    if (/[\u0900-\u097F]/.test(text)) lang = 'hi';
    else if (/[\u0600-\u06FF]/.test(text)) lang = 'ar';
    else if (/[\u4E00-\u9FFF]/.test(text)) lang = 'zh';
    else if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) lang = 'ja';
    else if (/[\uAC00-\uD7AF]/.test(text)) lang = 'ko';
    else if (/[\u0400-\u04FF]/.test(text)) lang = 'ru';
    else if (/[áéíóúñ¿¡]/i.test(text)) lang = 'es';
    
    document.documentElement.lang = lang;
}

/**
 * Sets up Web Speech API if the browser supports it.
 * Gracefully hides the microphone button if unsupported.
 */
function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        if (micBtn) micBtn.style.display = 'none';
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    micBtn.addEventListener('click', () => {
        if (isRecording) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add('text-error', 'animate-pulse');
        micBtn.setAttribute('aria-pressed', 'true');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        inputField.value = transcript;
        handleSend();
    };

    const stopRecordingUI = () => {
        isRecording = false;
        micBtn.classList.remove('text-error', 'animate-pulse');
        micBtn.setAttribute('aria-pressed', 'false');
    };

    recognition.onend = stopRecordingUI;
    
    recognition.onerror = stopRecordingUI;
}
