import { jest } from '@jest/globals';

// Set up mocks for dependencies since we are only testing validation logic
process.env.GEMINI_API_KEY = 'test_key';

const mockGetZoneByName = jest.fn();
jest.unstable_mockModule('../../functions/firestore.js', () => ({
    getZoneByName: mockGetZoneByName,
    updateZoneCrowdLevel: jest.fn()
}));

const mockSendMessage = jest.fn();
const mockStartChat = jest.fn().mockReturnValue({ sendMessage: mockSendMessage });
const mockGetGenerativeModel = jest.fn().mockReturnValue({ startChat: mockStartChat });
const mockGenAI = { getGenerativeModel: mockGetGenerativeModel };

const { getGeminiResponse, _setGenAIForTesting } = await import('../../functions/gemini.js');
const { chat, updateCrowdLevel } = await import('../../functions/index.js');
const { updateZoneCrowdLevel } = await import('../../functions/firestore.js');

describe('Validation Constraints (Unit)', () => {
    beforeAll(() => {
        _setGenAIForTesting(mockGenAI);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockSendMessage.mockResolvedValue({
            response: { functionCalls: () => [], text: () => 'Mocked text' }
        });
    });

    describe('XSS and Payload Sanitization (gemini.js)', () => {
        const maliciousPayloads = [
            '<script>alert(1)</script>',
            'javascript:alert(1)',
            '<img src="x" onerror="alert(1)">',
            '<svg/onload=alert(1)>',
            '"><script>alert(XSS)</script>',
            '--><script>alert(XSS)</script>',
            '\'><script>alert(XSS)</script>',
            '{{7*7}}',
            '${7*7}',
            '<%= 7*7 %>',
            'a'.repeat(400) + '<script>'
        ];

        test.each(maliciousPayloads)('neutralizes/handles payload without crashing: %s', async (payload) => {
            // As long as it doesn't throw a validation error (other than our custom 400), it's safe.
            // Gemini handles strings natively. We just assert it passes to the model cleanly.
            const result = await getGeminiResponse(payload);
            expect(result.text).toBe('Mocked text');
        });
    });

    describe('Boundary Limits (gemini.js)', () => {
        it('accepts string of 1 character', async () => {
            await expect(getGeminiResponse('a')).resolves.not.toThrow();
        });

        it('accepts string of 250 characters (mid boundary)', async () => {
            await expect(getGeminiResponse('a'.repeat(250))).resolves.not.toThrow();
        });

        it('accepts string of 499 characters', async () => {
            await expect(getGeminiResponse('a'.repeat(499))).resolves.not.toThrow();
        });

        it('accepts string of exactly 500 characters', async () => {
            await expect(getGeminiResponse('a'.repeat(500))).resolves.not.toThrow();
        });

        it('rejects string of 501 characters', async () => {
            await expect(getGeminiResponse('a'.repeat(501))).rejects.toThrow('Message exceeds the maximum allowed length of 500 characters.');
        });

        it('rejects string of 1000 characters', async () => {
            await expect(getGeminiResponse('a'.repeat(1000))).rejects.toThrow('Message exceeds the maximum allowed length of 500 characters.');
        });

        it('rejects string containing only spaces up to 500 characters', async () => {
            await expect(getGeminiResponse(' '.repeat(500))).rejects.toThrow('Message cannot be whitespace only.');
        });
    });

    describe('Missing Fields Validation (index.js chat endpoint)', () => {
        const createMockReqRes = (body) => {
            const req = {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body,
                socket: {}
            };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), on: jest.fn(), getHeader: jest.fn(), setHeader: jest.fn(), end: jest.fn(), send: jest.fn() };
            return { req, res };
        };

        it('rejects completely empty body', () => {
            const { req, res } = createMockReqRes({});
            chat(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('required') });
        });

        it('rejects body with wrong property name', () => {
            const { req, res } = createMockReqRes({ text: 'hello' });
            chat(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects body with non-string message (number)', () => {
            const { req, res } = createMockReqRes({ message: 123 });
            chat(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects body with non-string message (object)', () => {
            const { req, res } = createMockReqRes({ message: { msg: 'hello' } });
            chat(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('Missing Fields Validation (index.js updateCrowdLevel endpoint)', () => {
        const createMockReqRes = (body) => {
            const req = { method: 'POST', headers: { 'content-type': 'application/json' }, body, socket: {} };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), on: jest.fn(), getHeader: jest.fn(), setHeader: jest.fn(), end: jest.fn(), send: jest.fn() };
            return { req, res };
        };

        it('rejects missing zoneId', () => {
            const { req, res } = createMockReqRes({ level: 'low', updatedBy: 'admin' });
            updateCrowdLevel(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects missing level', () => {
            const { req, res } = createMockReqRes({ zoneId: 'z1', updatedBy: 'admin' });
            updateCrowdLevel(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects missing updatedBy', () => {
            const { req, res } = createMockReqRes({ zoneId: 'z1', level: 'low' });
            updateCrowdLevel(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects empty string for zoneId', () => {
            const { req, res } = createMockReqRes({ zoneId: ' ', level: 'low', updatedBy: 'admin' });
            updateCrowdLevel(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects empty string for level', () => {
            const { req, res } = createMockReqRes({ zoneId: 'z1', level: ' ', updatedBy: 'admin' });
            updateCrowdLevel(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects empty string for updatedBy', () => {
            const { req, res } = createMockReqRes({ zoneId: 'z1', level: 'low', updatedBy: ' ' });
            updateCrowdLevel(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects non-string for zoneId', () => {
            const { req, res } = createMockReqRes({ zoneId: 123, level: 'low', updatedBy: 'admin' });
            updateCrowdLevel(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects non-string for level', () => {
            const { req, res } = createMockReqRes({ zoneId: 'z1', level: 123, updatedBy: 'admin' });
            updateCrowdLevel(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects non-string for updatedBy', () => {
            const { req, res } = createMockReqRes({ zoneId: 'z1', level: 'low', updatedBy: 123 });
            updateCrowdLevel(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('HTTP Method and Content-Type Validation (index.js)', () => {
        const createMockReqRes = (method, headers, body) => {
            const req = { method, headers, body, socket: {} };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), on: jest.fn(), getHeader: jest.fn(), setHeader: jest.fn(), end: jest.fn(), send: jest.fn() };
            return { req, res };
        };

        const endpoints = [
            { name: 'chat', fn: chat },
            { name: 'updateCrowdLevel', fn: updateCrowdLevel }
        ];

        endpoints.forEach(({ name, fn }) => {
            describe(`${name} endpoint`, () => {
                it('rejects GET method', () => {
                    const { req, res } = createMockReqRes('GET', { 'content-type': 'application/json' }, {});
                    fn(req, res);
                    expect(res.status).toHaveBeenCalledWith(405);
                });

                it('rejects PUT method', () => {
                    const { req, res } = createMockReqRes('PUT', { 'content-type': 'application/json' }, {});
                    fn(req, res);
                    expect(res.status).toHaveBeenCalledWith(405);
                });

                it('rejects DELETE method', () => {
                    const { req, res } = createMockReqRes('DELETE', { 'content-type': 'application/json' }, {});
                    fn(req, res);
                    expect(res.status).toHaveBeenCalledWith(405);
                });

                it('rejects PATCH method', () => {
                    const { req, res } = createMockReqRes('PATCH', { 'content-type': 'application/json' }, {});
                    fn(req, res);
                    expect(res.status).toHaveBeenCalledWith(405);
                });

                it('rejects text/plain content-type', () => {
                    const { req, res } = createMockReqRes('POST', { 'content-type': 'text/plain' }, {});
                    fn(req, res);
                    expect(res.status).toHaveBeenCalledWith(415);
                });

                it('rejects application/x-www-form-urlencoded content-type', () => {
                    const { req, res } = createMockReqRes('POST', { 'content-type': 'application/x-www-form-urlencoded' }, {});
                    fn(req, res);
                    expect(res.status).toHaveBeenCalledWith(415);
                });

                it('rejects multipart/form-data content-type', () => {
                    const { req, res } = createMockReqRes('POST', { 'content-type': 'multipart/form-data' }, {});
                    fn(req, res);
                    expect(res.status).toHaveBeenCalledWith(415);
                });

                it('rejects missing content-type header', () => {
                    const { req, res } = createMockReqRes('POST', {}, {});
                    fn(req, res);
                    expect(res.status).toHaveBeenCalledWith(415);
                });
            });
        });
    });
});
