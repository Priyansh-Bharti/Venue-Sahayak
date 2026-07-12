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

/**
 * Handles message submission (debounced via state lock).
 */
async function handleSend() {
    const text = inputField.value.trim();
    if (!text || isProcessing) return;

    lockInputState();
    appendUserMessage(text);
    const indicatorId = appendTypingIndicator();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        
        if (!response.ok) throw new Error('API Request Failed');
        
        const data = await response.json();
        removeElement(indicatorId);
        appendAssistantMessage(data.reply);
        updateLanguage(data.reply);
        
        if (data.zone && typeof window.renderZoneOnMap === 'function') {
            window.renderZoneOnMap(data.zone);
        }
    } catch (error) {
        removeElement(indicatorId);
        appendAssistantMessage("Something went wrong, please try again.");
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
