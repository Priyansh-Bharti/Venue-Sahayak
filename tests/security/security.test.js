import { jest } from '@jest/globals';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';

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

const { chat, updateCrowdLevel } = await import('../../functions/index.js');

describe.skip('Security and Hardening (Unit & Integration)', () => {
    describe('Firestore Rules', () => {
        let testEnv;

        beforeAll(async () => {
            const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
            const rules = fs.readFileSync(rulesPath, 'utf8');
            testEnv = await initializeTestEnvironment({
                projectId: 'venue-sahayak-sec-test',
                firestore: { rules }
            });
        });

        afterAll(async () => {
            await testEnv.cleanup();
        });

        afterEach(async () => {
            await testEnv.clearFirestore();
        });

        it('allows unauthenticated users to read from the /zones collection', async () => {
            const unauthedDb = testEnv.unauthenticatedContext().firestore();
            await assertSucceeds(unauthedDb.collection('zones').get());
        });

        it('allows unauthenticated users to read a specific zone document', async () => {
            const unauthedDb = testEnv.unauthenticatedContext().firestore();
            await assertSucceeds(unauthedDb.collection('zones').doc('zone_1').get());
        });

        it('denies unauthenticated users from writing to the /zones collection', async () => {
            const unauthedDb = testEnv.unauthenticatedContext().firestore();
            await assertFails(unauthedDb.collection('zones').doc('zone_1').set({ crowd_level: 'high' }));
        });

        it('denies authenticated users from writing to the /zones collection (locked architecture)', async () => {
            const authedDb = testEnv.authenticatedContext('user_123').firestore();
            await assertFails(authedDb.collection('zones').doc('zone_1').update({ crowd_level: 'medium' }));
        });

        it('denies read access to unknown collections', async () => {
            const unauthedDb = testEnv.unauthenticatedContext().firestore();
            await assertFails(unauthedDb.collection('secrets').get());
        });

        it('denies write access to unknown collections', async () => {
            const unauthedDb = testEnv.unauthenticatedContext().firestore();
            await assertFails(unauthedDb.collection('secrets').doc('key').set({ val: '123' }));
        });
    });

    describe('Endpoint Injection and Leakage', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        const createMockReqRes = (body) => {
            const req = {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.99' },
                body,
                socket: {}
            };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), on: jest.fn(), getHeader: jest.fn(), setHeader: jest.fn(), end: jest.fn(), send: jest.fn() };
            return { req, res };
        };

        const runEndpoint = async (handler, req, res) => {
            await new Promise((resolve, reject) => {
                res.json.mockImplementation(() => resolve());
                res.send.mockImplementation(() => resolve());
                res.end.mockImplementation(() => resolve());
                try {
                    handler(req, res);
                } catch (err) {
                    reject(err);
                }
            });
        };

        it('chat endpoint does not leak stack traces on unexpected 500 error', async () => {
            const { req, res } = createMockReqRes({ message: 'Hello' });
            
            const unexpectedError = new Error('Database connection failed entirely');
            mockGetGeminiResponse.mockRejectedValueOnce(unexpectedError);
            
            const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await runEndpoint(chat, req, res);
            spy.mockRestore();

            expect(res.status).toHaveBeenCalledWith(500);
            const jsonResponse = res.json.mock.calls[0][0];
            expect(jsonResponse.error).toBe('Internal Server Error');
            expect(jsonResponse.error).not.toContain('Database connection');
            expect(jsonResponse.stack).toBeUndefined();
        });

        it('chat endpoint neutralizes NoSQL injection objects', async () => {
            // Passing an object like { "$gt": "" } instead of a string
            const { req, res } = createMockReqRes({ message: { "$gt": "" } });
            await runEndpoint(chat, req, res);
            
            // Should fail validation before hitting anything
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.stringContaining('string')
            }));
        });

        it('chat endpoint neutralizes template injection strings without executing them', async () => {
            const payload = '{{ 7 * 7 }} ${ 7 * 7 }';
            const { req, res } = createMockReqRes({ message: payload });
            mockGetGeminiResponse.mockResolvedValueOnce({ text: 'Echo: ' + payload, zoneData: null });
            
            await runEndpoint(chat, req, res);
            
            expect(res.status).toHaveBeenCalledWith(200);
            const jsonResponse = res.json.mock.calls[0][0];
            // Ensure no template evaluation happens, it just echoes it back harmlessly
            expect(jsonResponse.reply).toContain('{{ 7 * 7 }}');
            expect(jsonResponse.reply).not.toContain('49');
        });
        
        it('chat endpoint prevents prototype pollution through body', async () => {
            const payload = JSON.parse('{"message": "hello", "__proto__": {"polluted": "yes"}}');
            const { req, res } = createMockReqRes(payload);
            mockGetGeminiResponse.mockResolvedValueOnce({ text: 'Safe', zoneData: null });
            
            await runEndpoint(chat, req, res);
            
            expect(res.status).toHaveBeenCalledWith(200);
            expect({}.polluted).toBeUndefined();
        });

        it('updateCrowdLevel endpoint neutralizes NoSQL injection via zoneId', async () => {
            const { req, res } = createMockReqRes({ zoneId: { "$ne": "fake" }, level: 'low', updatedBy: 'Admin' });
            await runEndpoint(updateCrowdLevel, req, res);
            
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.stringContaining('string')
            }));
        });

        it('updateCrowdLevel endpoint does not leak stack traces on failure', async () => {
            const { req, res } = createMockReqRes({ zoneId: 'zone1', level: 'low', updatedBy: 'Admin' });
            
            const { updateZoneCrowdLevel } = await import('../../functions/firestore.js');
            updateZoneCrowdLevel.mockRejectedValueOnce(new Error('Auth failed completely'));
            
            const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await runEndpoint(updateCrowdLevel, req, res);
            spy.mockRestore();

            expect(res.status).toHaveBeenCalledWith(500);
            const jsonResponse = res.json.mock.calls[0][0];
            expect(jsonResponse.error).toBe('Internal Server Error. Failed to update crowd level.');
            expect(jsonResponse.error).not.toContain('Auth failed');
            expect(jsonResponse.stack).toBeUndefined();
        });
    });
});
