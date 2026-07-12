import { jest } from '@jest/globals';

const mockUpdate = jest.fn();
const mockDoc = jest.fn().mockReturnValue({ update: mockUpdate });
const mockGet = jest.fn();
const mockCollection = jest.fn().mockReturnValue({
    doc: mockDoc,
    get: mockGet
});

const mockGetFirestore = {
    collection: mockCollection
};

jest.unstable_mockModule('firebase-admin/app', () => ({
    initializeApp: jest.fn(),
    getApps: jest.fn().mockReturnValue([])
}));

jest.unstable_mockModule('firebase-admin/firestore', () => ({
    getFirestore: jest.fn(),
    FieldValue: {
        serverTimestamp: jest.fn().mockReturnValue('MOCK_TIMESTAMP')
    }
}));

const { getZoneByName, updateZoneCrowdLevel, getAllZones, _setDbForTesting } = await import('../../functions/firestore.js');

describe('firestore.js (Unit)', () => {
    beforeAll(() => {
        _setDbForTesting(mockGetFirestore);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getZoneByName', () => {
        beforeEach(() => {
            mockGet.mockResolvedValue({
                docs: [
                    { id: '1', data: () => ({ name: 'Main Gate' }) },
                    { id: '2', data: () => ({ name: 'Food Court' }) },
                    { id: '3', data: () => ({ name: 'VIP Lounge' }) }
                ]
            });
        });

        it('finds an exact match', async () => {
            const result = await getZoneByName('Main Gate');
            expect(result).toEqual({ id: '1', name: 'Main Gate' });
        });

        it('finds a match with lowercase case variation', async () => {
            const result = await getZoneByName('main gate');
            expect(result).toEqual({ id: '1', name: 'Main Gate' });
        });

        it('finds a match with uppercase case variation', async () => {
            const result = await getZoneByName('MAIN GATE');
            expect(result).toEqual({ id: '1', name: 'Main Gate' });
        });

        it('finds a match with mixed case and extra whitespace variation', async () => {
            const result = await getZoneByName('   mAiN gaTe   ');
            expect(result).toEqual({ id: '1', name: 'Main Gate' });
        });

        it('finds a partial match (substring)', async () => {
            const result = await getZoneByName('food');
            expect(result).toEqual({ id: '2', name: 'Food Court' });
        });

        it('finds a partial match reversed (input contains zone name)', async () => {
            const result = await getZoneByName('take me to the VIP lounge please');
            expect(result).toEqual({ id: '3', name: 'VIP Lounge' });
        });

        it('returns null for no match', async () => {
            const result = await getZoneByName('Stage B');
            expect(result).toBeNull();
        });

        it('throws an error for empty string input', async () => {
            await expect(getZoneByName('')).rejects.toThrow('Invalid zone name provided.');
        });

        it('returns null for purely special character input', async () => {
            const result = await getZoneByName('!!!@@@');
            expect(result).toBeNull();
        });
    });

    describe('updateZoneCrowdLevel', () => {
        it('succeeds for "low" enum', async () => {
            mockUpdate.mockResolvedValue({});
            await updateZoneCrowdLevel('zone1', 'low', 'Admin');
            expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ crowd_level: 'low' }));
        });

        it('succeeds for "medium" enum', async () => {
            mockUpdate.mockResolvedValue({});
            await updateZoneCrowdLevel('zone1', 'medium', 'Admin');
            expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ crowd_level: 'medium' }));
        });

        it('succeeds for "high" enum', async () => {
            mockUpdate.mockResolvedValue({});
            await updateZoneCrowdLevel('zone1', 'high', 'Admin');
            expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ crowd_level: 'high' }));
        });

        it('rejects wrong string value', async () => {
            await expect(updateZoneCrowdLevel('zone1', 'extreme', 'Admin')).rejects.toThrow(TypeError);
        });

        it('rejects wrong case value ("Low")', async () => {
            await expect(updateZoneCrowdLevel('zone1', 'Low', 'Admin')).rejects.toThrow(TypeError);
        });

        it('rejects string with extra whitespace (" low ")', async () => {
            await expect(updateZoneCrowdLevel('zone1', ' low ', 'Admin')).rejects.toThrow(TypeError);
        });

        it('rejects number type', async () => {
            await expect(updateZoneCrowdLevel('zone1', 1, 'Admin')).rejects.toThrow(TypeError);
        });

        it('rejects null type', async () => {
            await expect(updateZoneCrowdLevel('zone1', null, 'Admin')).rejects.toThrow(TypeError);
        });

        it('rejects undefined type', async () => {
            await expect(updateZoneCrowdLevel('zone1', undefined, 'Admin')).rejects.toThrow(TypeError);
        });

        it('rejects empty string', async () => {
            await expect(updateZoneCrowdLevel('zone1', '', 'Admin')).rejects.toThrow(TypeError);
        });

        it('rejects missing updatedBy', async () => {
            await expect(updateZoneCrowdLevel('zone1', 'low')).rejects.toThrow('zoneId and updatedBy are required to update crowd level.');
        });
    });

    describe('getAllZones', () => {
        it('returns empty array when collection is empty', async () => {
            mockGet.mockResolvedValue({ docs: [] });
            const zones = await getAllZones();
            expect(zones).toEqual([]);
        });

        it('returns array with single zone correctly mapped', async () => {
            mockGet.mockResolvedValue({
                docs: [{ id: 'z1', data: () => ({ name: 'Z1', crowd_level: 'low' }) }]
            });
            const zones = await getAllZones();
            expect(zones).toHaveLength(1);
            expect(zones[0]).toEqual({ id: 'z1', name: 'Z1', crowd_level: 'low' });
        });

        it('returns array with multiple zones', async () => {
            mockGet.mockResolvedValue({
                docs: [
                    { id: 'z1', data: () => ({ name: 'Z1' }) },
                    { id: 'z2', data: () => ({ name: 'Z2' }) },
                    { id: 'z3', data: () => ({ name: 'Z3' }) }
                ]
            });
            const zones = await getAllZones();
            expect(zones).toHaveLength(3);
        });
    });

    describe('Error Handling', () => {
        it('throws appropriately on Firestore timeout for getZoneByName', async () => {
            mockGet.mockRejectedValue(new Error('Deadline Exceeded'));
            await expect(getZoneByName('Gate')).rejects.toThrow('Deadline Exceeded');
        });

        it('throws appropriately on Firestore permission denied for getZoneByName', async () => {
            mockGet.mockRejectedValue(new Error('Permission Denied'));
            await expect(getZoneByName('Gate')).rejects.toThrow('Permission Denied');
        });

        it('throws appropriately on offline error', async () => {
            mockGet.mockRejectedValue(new Error('Network Error'));
            await expect(getZoneByName('Gate')).rejects.toThrow('Network Error');
        });

        it('throws on Firestore timeout for updateZoneCrowdLevel', async () => {
            mockUpdate.mockRejectedValue(new Error('Deadline Exceeded'));
            await expect(updateZoneCrowdLevel('zone1', 'low', 'A')).rejects.toThrow('Deadline Exceeded');
        });

        it('throws on permission denied for updateZoneCrowdLevel', async () => {
            mockUpdate.mockRejectedValue(new Error('Permission Denied'));
            await expect(updateZoneCrowdLevel('zone1', 'low', 'A')).rejects.toThrow('Permission Denied');
        });

        it('safely handles malformed document data missing name field during getZoneByName search', async () => {
            mockGet.mockResolvedValue({
                docs: [{ id: '1', data: () => ({ crowd_level: 'low' }) }] // No name
            });
            const result = await getZoneByName('gate');
            expect(result).toBeNull();
        });
        
        it('safely handles corrupted collection throwing unexpected error', async () => {
            mockGet.mockImplementation(() => { throw new Error('Corrupted Data'); });
            await expect(getAllZones()).rejects.toThrow('Corrupted Data');
        });

        it('safely handles malformed docs missing data method entirely during getZoneByName', async () => {
            mockGet.mockResolvedValue({
                docs: [{ id: '1' }] // No data function
            });
            await expect(getZoneByName('gate')).rejects.toThrow();
        });

        it('safely handles missing docs array in getAllZones', async () => {
            mockGet.mockResolvedValue({}); // Missing docs
            await expect(getAllZones()).rejects.toThrow();
        });

        it('safely handles empty name string in database during getZoneByName search', async () => {
            mockGet.mockResolvedValue({
                docs: [{ id: '1', data: () => ({ name: '' }) }]
            });
            const result = await getZoneByName('gate');
            expect(result).toBeNull();
        });

        it('safely handles numerical name type in database during getZoneByName search', async () => {
            mockGet.mockResolvedValue({
                docs: [{ id: '1', data: () => ({ name: 12345 }) }]
            });
            const result = await getZoneByName('gate');
            expect(result).toBeNull();
        });

        it('safely handles null name field in database during getZoneByName search', async () => {
            mockGet.mockResolvedValue({
                docs: [{ id: '1', data: () => ({ name: null }) }]
            });
            const result = await getZoneByName('gate');
            expect(result).toBeNull();
        });
    });
});
