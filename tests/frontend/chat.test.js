/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('chat.js (Frontend Logic)', () => {
    let chatJsContent;

    beforeAll(() => {
        chatJsContent = fs.readFileSync(path.resolve(process.cwd(), 'public', 'js', 'chat.js'), 'utf8');
    });

    beforeEach(() => {
        // Mock the required DOM for chat.js
        document.body.innerHTML = `
            <div id="chat-thread"></div>
            <input type="text" />
            <button><span class="material-symbols-outlined" data-icon="send">send</span></button>
            <button><span class="material-symbols-outlined" data-icon="mic">mic</span></button>
        `;
        
        // Reset fetch
        global.fetch = jest.fn();
        
        // Clear speech recognition
        delete window.SpeechRecognition;
        delete window.webkitSpeechRecognition;
        
        // Clear global map render mock
        delete window.renderZoneOnMap;

        // Execute chat.js in the current JSDOM context
        // Using eval is safe here because it's our own code running in a test
        eval(chatJsContent);
    });

    it('hides the microphone button if SpeechRecognition is not supported', () => {
        const micBtn = document.querySelector('button .material-symbols-outlined[data-icon="mic"]').parentElement;
        expect(micBtn.style.display).toBe('none');
    });

    it('shows microphone button and handles recording UI if SpeechRecognition is supported', () => {
        // We have to re-evaluate after mocking SpeechRecognition
        document.body.innerHTML = `
            <div id="chat-thread"></div>
            <input type="text" />
            <button><span class="material-symbols-outlined" data-icon="send">send</span></button>
            <button><span class="material-symbols-outlined" data-icon="mic">mic</span></button>
        `;
        
        const mockStart = jest.fn();
        const mockStop = jest.fn();
        class MockSpeechRecognition {
            constructor() {
                this.start = mockStart;
                this.stop = mockStop;
            }
        }
        window.SpeechRecognition = MockSpeechRecognition;
        
        eval(chatJsContent);
        
        const micBtn = document.querySelector('button .material-symbols-outlined[data-icon="mic"]').parentElement;
        expect(micBtn.style.display).not.toBe('none');
        
        micBtn.click();
        expect(mockStart).toHaveBeenCalled();
        
        // Simulate start event
        const recognitionInstance = mockStart.mock.instances[0];
        recognitionInstance.onstart();
        expect(micBtn.classList.contains('text-error')).toBe(true);
        expect(micBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('disables input and shows typing indicator immediately on send', async () => {
        const inputField = document.querySelector('input[type="text"]');
        const sendBtn = document.querySelector('button .material-symbols-outlined[data-icon="send"]').parentElement;
        
        inputField.value = 'Hello';
        
        // Mock a pending fetch
        let resolveFetch;
        global.fetch.mockReturnValue(new Promise(resolve => { resolveFetch = resolve; }));
        
        sendBtn.click();
        
        expect(inputField.disabled).toBe(true);
        
        // Typing indicator should be present
        const thread = document.getElementById('chat-thread');
        expect(thread.innerHTML).toContain('animate-pulse');
        
        // Resolve fetch to clean up
        resolveFetch({ ok: true, json: () => Promise.resolve({ reply: 'Hi', zone: null }) });
    });

    it('appends user message, calls fetch, and appends assistant reply', async () => {
        const inputField = document.querySelector('input[type="text"]');
        const sendBtn = document.querySelector('button .material-symbols-outlined[data-icon="send"]').parentElement;
        
        inputField.value = 'Where is the exit?';
        
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ reply: 'The exit is on the right.', zone: null })
        });
        
        // Trigger send
        sendBtn.click();
        
        // Need to wait for macro-task queue to clear since fetch is async
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const thread = document.getElementById('chat-thread');
        expect(thread.innerHTML).toContain('Where is the exit?');
        expect(thread.innerHTML).toContain('The exit is on the right.');
        
        // Indicator should be gone
        expect(thread.innerHTML).not.toContain('animate-pulse');
        expect(inputField.disabled).toBe(false);
    });

    it('calls renderZoneOnMap if zone data is returned', async () => {
        const inputField = document.querySelector('input[type="text"]');
        const sendBtn = document.querySelector('button .material-symbols-outlined[data-icon="send"]').parentElement;
        
        inputField.value = 'Gate 1';
        
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ reply: 'Here is Gate 1.', zone: { name: 'Gate 1', lat: 10, lng: 20, crowd_level: 'low' } })
        });
        
        window.renderZoneOnMap = jest.fn();
        
        sendBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(window.renderZoneOnMap).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Gate 1', crowd_level: 'low' })
        );
    });

    it('shows fallback error message on API failure', async () => {
        const inputField = document.querySelector('input[type="text"]');
        const sendBtn = document.querySelector('button .material-symbols-outlined[data-icon="send"]').parentElement;
        
        inputField.value = 'Hello';
        
        global.fetch.mockRejectedValue(new Error('Network disconnected'));
        
        sendBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const thread = document.getElementById('chat-thread');
        expect(thread.innerHTML).toContain('Something went wrong, please try again.');
        expect(inputField.disabled).toBe(false);
    });

    it('shows fallback error message on non-ok HTTP status', async () => {
        const inputField = document.querySelector('input[type="text"]');
        const sendBtn = document.querySelector('button .material-symbols-outlined[data-icon="send"]').parentElement;
        
        inputField.value = 'Hello';
        
        global.fetch.mockResolvedValue({ ok: false, status: 500 });
        
        sendBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const thread = document.getElementById('chat-thread');
        expect(thread.innerHTML).toContain('Something went wrong, please try again.');
    });

    it('prevents double-submission when processing', async () => {
        const inputField = document.querySelector('input[type="text"]');
        const sendBtn = document.querySelector('button .material-symbols-outlined[data-icon="send"]').parentElement;
        
        inputField.value = 'Hello';
        
        // Hang the fetch
        global.fetch.mockReturnValue(new Promise(() => {}));
        
        sendBtn.click();
        
        // Try clicking again
        inputField.value = 'Second';
        sendBtn.click();
        
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('escapes XSS payloads in user input before rendering', async () => {
        const inputField = document.querySelector('input[type="text"]');
        const sendBtn = document.querySelector('button .material-symbols-outlined[data-icon="send"]').parentElement;
        
        const payload = '<script>alert(1)</script><img src="x" onerror="alert(1)">';
        inputField.value = payload;
        
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ reply: 'Safe', zone: null })
        });
        
        sendBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const thread = document.getElementById('chat-thread');
        // The raw payload should NOT exist in the DOM as HTML
        expect(thread.innerHTML).not.toContain('<script>alert(1)</script>');
        // It should be escaped
        expect(thread.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes XSS payloads in assistant response before rendering', async () => {
        const inputField = document.querySelector('input[type="text"]');
        const sendBtn = document.querySelector('button .material-symbols-outlined[data-icon="send"]').parentElement;
        
        inputField.value = 'Hello';
        
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ reply: '<svg onload=alert(1)>', zone: null })
        });
        
        sendBtn.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const thread = document.getElementById('chat-thread');
        expect(thread.innerHTML).not.toContain('<svg onload=alert(1)>');
        expect(thread.innerHTML).toContain('&lt;svg onload=alert(1)&gt;');
    });

    it('triggers handleSend on Enter keypress', async () => {
        const inputField = document.querySelector('input[type="text"]');
        inputField.value = 'Test enter';
        
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ reply: 'Reply', zone: null })
        });
        
        const event = new window.KeyboardEvent('keypress', { key: 'Enter' });
        inputField.dispatchEvent(event);
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
