import { jest } from '@jest/globals';

const mockUpdateZoneCrowdLevel = jest.fn();
jest.unstable_mockModule('../../functions/firestore.js', () => ({
    updateZoneCrowdLevel: mockUpdateZoneCrowdLevel,
    getAllZones: jest.fn(),
    getZoneByName: jest.fn()
}));

jest.unstable_mockModule('../../functions/gemini.js', () => ({
    getGeminiResponse: jest.fn()
}));

jest.unstable_mockModule('firebase-functions/v2/https', () => ({
    onRequest: (opts, handler) => handler 
}));

jest.unstable_mockModule('firebase-functions/params', () => ({
    defineSecret: jest.fn().mockReturnValue({})
}));

const { updateCrowdLevel } = await import('../../functions/index.js');

describe('updateCrowdLevel HTTP endpoint (Integration)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createMockReqRes = (method, body, contentType = 'application/json') => {
        const req = {
            method,
            headers: { 'content-type': contentType },
            body,
            socket: {}
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), on: jest.fn(), getHeader: jest.fn(), setHeader: jest.fn(), end: jest.fn(), send: jest.fn() };
        return { req, res };
    };

    const runAdminEndpoint = async (req, res) => {
        await new Promise((resolve, reject) => {
            res.json.mockImplementation(() => resolve());
            res.send.mockImplementation(() => resolve());
            res.end.mockImplementation(() => resolve());
            try {
                updateCrowdLevel(req, res);
            } catch (err) {
                reject(err);
            }
        });
    };

    describe('HTTP Method Matrix', () => {
        const rejectedMethods = ['GET', 'PUT', 'DELETE', 'PATCH'];
        test.each(rejectedMethods)('rejects %s method with 405', async (method) => {
            const { req, res } = createMockReqRes(method, { zoneId: 'z1', level: 'low', updatedBy: 'admin' });
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(405);
            expect(res.json).toHaveBeenCalledWith({ error: 'Method Not Allowed' });
        });
    });

    describe('Header Validation', () => {
        it('rejects missing content-type with 415', async () => {
            const { req, res } = createMockReqRes('POST', { zoneId: 'z1', level: 'low', updatedBy: 'admin' }, null);
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(415);
        });

        it('rejects invalid content-type with 415', async () => {
            const { req, res } = createMockReqRes('POST', { zoneId: 'z1', level: 'low', updatedBy: 'admin' }, 'application/x-www-form-urlencoded');
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(415);
        });
    });

    describe('Input Validation', () => {
        it('rejects missing zoneId', async () => {
            const { req, res } = createMockReqRes('POST', { level: 'low', updatedBy: 'admin' });
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('zoneId') });
        });

        it('rejects non-string zoneId', async () => {
            const { req, res } = createMockReqRes('POST', { zoneId: 123, level: 'low', updatedBy: 'admin' });
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('zoneId') });
        });

        it('rejects missing updatedBy', async () => {
            const { req, res } = createMockReqRes('POST', { zoneId: 'z1', level: 'low' });
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('updatedBy') });
        });

        it('rejects non-string updatedBy', async () => {
            const { req, res } = createMockReqRes('POST', { zoneId: 'z1', level: 'low', updatedBy: { name: 'admin' } });
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('updatedBy') });
        });

        it('rejects missing level', async () => {
            const { req, res } = createMockReqRes('POST', { zoneId: 'z1', updatedBy: 'admin' });
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('level') });
        });

        const invalidLevels = ['LOW', ' low', 'extreme', '', 'null', 'undefined'];
        test.each(invalidLevels)('rejects invalid level string: "%s"', async (invalidLevel) => {
            const { req, res } = createMockReqRes('POST', { zoneId: 'z1', level: invalidLevel, updatedBy: 'admin' });
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('level') });
        });

        const invalidLevelTypes = [123, null, undefined, true, false, [], {}];
        test.each(invalidLevelTypes)('rejects invalid level type: %p', async (invalidLevel) => {
            const { req, res } = createMockReqRes('POST', { zoneId: 'z1', level: invalidLevel, updatedBy: 'admin' });
            await runAdminEndpoint(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('level') });
        });
    });

    describe('Success Path', () => {
        const validLevels = ['low', 'medium', 'high'];
        test.each(validLevels)('successfully updates to %s level', async (level) => {
            const { req, res } = createMockReqRes('POST', { zoneId: 'zone_123', level, updatedBy: 'Volunteer A' });
            
            mockUpdateZoneCrowdLevel.mockResolvedValueOnce({});
            
            await runAdminEndpoint(req, res);
            
            expect(mockUpdateZoneCrowdLevel).toHaveBeenCalledWith('zone_123', level, 'Volunteer A');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                updated_at: expect.any(Number)
            });
        });
    });

    describe('Error Handling', () => {
        it('returns 500 when Firestore throws an error', async () => {
            const { req, res } = createMockReqRes('POST', { zoneId: 'zone_123', level: 'low', updatedBy: 'Volunteer A' });
            
            mockUpdateZoneCrowdLevel.mockRejectedValueOnce(new Error('Firestore failure'));
            
            // Suppress console.error for expected log
            const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
            await runAdminEndpoint(req, res);
            spy.mockRestore();

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error. Failed to update crowd level.' });
        });
    });
});
