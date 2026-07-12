import { jest } from '@jest/globals';

const mockGetGeminiResponse = jest.fn();
jest.unstable_mockModule('../../functions/gemini.js', () => ({
    getGeminiResponse: mockGetGeminiResponse
}));

jest.unstable_mockModule('../../functions/firestore.js', () => ({
    updateZoneCrowdLevel: jest.fn(),
    getAllZones: jest.fn(),
    getZoneByName: jest.fn()
}));

jest.unstable_mockModule('firebase-functions/v2/https', () => ({
    onRequest: (opts, handler) => handler 
}));

jest.unstable_mockModule('firebase-functions/params', () => ({
    defineSecret: jest.fn().mockReturnValue({})
}));

const { chat } = await import('../../functions/index.js');

describe('chat HTTP endpoint (Integration)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Since rate limiting is in-memory and stateful across tests, we should mock Date.now() if needed
        // but for simplicity we can just use different IPs for rate-limit tests.
    });

    const createMockReqRes = (method, body, contentType = 'application/json', ip = '127.0.0.1') => {
        const req = {
            method,
            headers: { 'content-type': contentType, 'x-forwarded-for': ip },
            body,
            socket: {}
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), on: jest.fn(), getHeader: jest.fn(), setHeader: jest.fn(), end: jest.fn(), send: jest.fn() };
        return { req, res };
    };

    const runChat = async (req, res) => {
        await new Promise((resolve, reject) => {
            res.json.mockImplementation(() => resolve());
            res.send.mockImplementation(() => resolve());
            res.end.mockImplementation(() => resolve());
            try {
                chat(req, res);
            } catch (err) {
                reject(err);
            }
        });
    };

    describe('HTTP Method Matrix', () => {
        const rejectedMethods = ['GET', 'PUT', 'DELETE', 'PATCH'];
        test.each(rejectedMethods)('rejects %s method with 405', async (method) => {
            const { req, res } = createMockReqRes(method, { message: 'hello' });
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(405);
            expect(res.json).toHaveBeenCalledWith({ error: 'Method Not Allowed' });
        });
    });

    describe('Header Validation', () => {
        it('rejects missing content-type with 415', async () => {
            const { req, res } = createMockReqRes('POST', { message: 'hello' }, null);
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(415);
        });

        it('rejects text/plain content-type with 415', async () => {
            const { req, res } = createMockReqRes('POST', { message: 'hello' }, 'text/plain');
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(415);
        });

        it('rejects application/xml content-type with 415', async () => {
            const { req, res } = createMockReqRes('POST', '<message>hello</message>', 'application/xml');
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(415);
        });

        it('accepts application/json; charset=utf-8', async () => {
            const { req, res } = createMockReqRes('POST', { message: 'hello' }, 'application/json; charset=utf-8');
            mockGetGeminiResponse.mockResolvedValueOnce({ text: 'Hi', zoneData: null });
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('Payload Validation', () => {
        it('rejects missing body with 400', async () => {
            const { req, res } = createMockReqRes('POST', undefined);
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects empty object with 400', async () => {
            const { req, res } = createMockReqRes('POST', {});
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects non-string message (number) with 400', async () => {
            const { req, res } = createMockReqRes('POST', { message: 12345 });
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects non-string message (array) with 400', async () => {
            const { req, res } = createMockReqRes('POST', { message: ['hello'] });
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('Rate Limiting (In-Memory)', () => {
        it('allows exactly 10 requests per minute from a single IP', async () => {
            const ip = '10.0.0.5';
            mockGetGeminiResponse.mockResolvedValue({ text: 'Ok', zoneData: null });
            
            for (let i = 0; i < 10; i++) {
                const { req, res } = createMockReqRes('POST', { message: 'Hello' }, 'application/json', ip);
                await runChat(req, res);
                expect(res.status).toHaveBeenCalledWith(200);
            }
        });

        it('rejects the 11th request with 429 Too Many Requests', async () => {
            const ip = '10.0.0.6';
            mockGetGeminiResponse.mockResolvedValue({ text: 'Ok', zoneData: null });
            
            for (let i = 0; i < 10; i++) {
                const { req, res } = createMockReqRes('POST', { message: 'Hello' }, 'application/json', ip);
                await runChat(req, res);
            }

            const { req, res } = createMockReqRes('POST', { message: 'Hello' }, 'application/json', ip);
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(429);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('Too Many Requests') });
        });

        it('isolates rate limits by IP', async () => {
            const ip1 = '10.0.0.7';
            const ip2 = '10.0.0.8';
            mockGetGeminiResponse.mockResolvedValue({ text: 'Ok', zoneData: null });
            
            for (let i = 0; i < 10; i++) {
                const { req, res } = createMockReqRes('POST', { message: 'Hello' }, 'application/json', ip1);
                await runChat(req, res);
            }

            // ip1 should fail
            const reqRes1 = createMockReqRes('POST', { message: 'Hello' }, 'application/json', ip1);
            await runChat(reqRes1.req, reqRes1.res);
            expect(reqRes1.res.status).toHaveBeenCalledWith(429);

            // ip2 should still succeed
            const reqRes2 = createMockReqRes('POST', { message: 'Hello' }, 'application/json', ip2);
            await runChat(reqRes2.req, reqRes2.res);
            expect(reqRes2.res.status).toHaveBeenCalledWith(200);
        });

        it('uses socket.remoteAddress if x-forwarded-for is missing', async () => {
            const reqRes = createMockReqRes('POST', { message: 'Hello' }, 'application/json', undefined);
            reqRes.req.socket.remoteAddress = '10.0.0.9';
            mockGetGeminiResponse.mockResolvedValue({ text: 'Ok', zoneData: null });
            
            for (let i = 0; i < 10; i++) {
                await runChat(reqRes.req, reqRes.res);
            }

            const nextReqRes = createMockReqRes('POST', { message: 'Hello' }, 'application/json', undefined);
            nextReqRes.req.socket.remoteAddress = '10.0.0.9';
            await runChat(nextReqRes.req, nextReqRes.res);
            expect(nextReqRes.res.status).toHaveBeenCalledWith(429);
        });

        it('resets rate limit window after 60 seconds', async () => {
            jest.useFakeTimers();
            const ip = '10.0.0.10';
            mockGetGeminiResponse.mockResolvedValue({ text: 'Ok', zoneData: null });
            
            for (let i = 0; i < 10; i++) {
                const { req, res } = createMockReqRes('POST', { message: 'Hello' }, 'application/json', ip);
                await runChat(req, res);
            }

            jest.advanceTimersByTime(60001); // advance by 60s

            const { req, res } = createMockReqRes('POST', { message: 'Hello' }, 'application/json', ip);
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            
            jest.useRealTimers();
        });
    });

    describe('Response Formatting and Data Passing', () => {
        it('returns sanitized zone data when available', async () => {
            const { req, res } = createMockReqRes('POST', { message: 'Where is Gate 1?' }, 'application/json', '10.0.1.1');
            mockGetGeminiResponse.mockResolvedValueOnce({
                text: 'Gate 1 is on the left.',
                zoneData: { name: 'Gate 1', lat: 10, lng: 20, crowd_level: 'low', extra_internal_id: 'secret' }
            });
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                reply: 'Gate 1 is on the left.',
                zone: { name: 'Gate 1', lat: 10, lng: 20, crowd_level: 'low' } // Assert secret field is stripped
            });
        });

        it('returns null zone if zoneData is "not found"', async () => {
            const { req, res } = createMockReqRes('POST', { message: 'Where is Fake?' }, 'application/json', '10.0.1.2');
            mockGetGeminiResponse.mockResolvedValueOnce({
                text: 'I could not find Fake.',
                zoneData: { status: 'not found' }
            });
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                reply: 'I could not find Fake.',
                zone: null
            });
        });

        it('returns null zone if no zoneData is returned from gemini', async () => {
            const { req, res } = createMockReqRes('POST', { message: 'Hello' }, 'application/json', '10.0.1.3');
            mockGetGeminiResponse.mockResolvedValueOnce({
                text: 'Hi',
                zoneData: null
            });
            await runChat(req, res);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                reply: 'Hi',
                zone: null
            });
        });
    });

    describe('Error Handling', () => {
        it('returns 500 when Gemini API throws an unexpected error', async () => {
            const { req, res } = createMockReqRes('POST', { message: 'Hello' }, 'application/json', '10.0.2.1');
            mockGetGeminiResponse.mockRejectedValueOnce(new Error('Unexpected Crash'));
            
            // Suppress console.error for this expected throw
            const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await runChat(req, res);
            spy.mockRestore();

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
        });

        it('propagates 400 status from gemini.js validation', async () => {
            const { req, res } = createMockReqRes('POST', { message: 'valid message' }, 'application/json', '10.0.2.2');
            const validationError = new Error('Message cannot be whitespace only.');
            validationError.status = 400;
            mockGetGeminiResponse.mockRejectedValueOnce(validationError);
            
            const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await runChat(req, res);
            spy.mockRestore();

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Message cannot be whitespace only.' });
        });

        it('propagates 429 status from gemini.js (upstream rate limit)', async () => {
            const { req, res } = createMockReqRes('POST', { message: 'Hello' }, 'application/json', '10.0.2.3');
            const upstreamError = new Error('Quota Exceeded');
            upstreamError.status = 429;
            mockGetGeminiResponse.mockRejectedValueOnce(upstreamError);
            
            const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await runChat(req, res);
            spy.mockRestore();

            expect(res.status).toHaveBeenCalledWith(429);
            expect(res.json).toHaveBeenCalledWith({ error: 'Quota Exceeded' });
        });
    });
});
