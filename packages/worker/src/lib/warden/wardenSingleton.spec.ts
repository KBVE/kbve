import '@vitest/web-worker';
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWardenInstance } from './wardenSingleton';

describe('WardenSingleton', () => {
    let warden: any; // Modify based on how you handle Comlink's types

    beforeEach(async () => {
        warden = await getWardenInstance();
    });

    it('should return the same Warden proxy instance', async () => {
        const warden1 = await getWardenInstance();
        const warden2 = await getWardenInstance();

        expect(warden1).toBe(warden2);
    });

    it('should initialize the minion pool correctly', async () => {
        try {
            const warden = await getWardenInstance(); // Ensure you're using the singleton instance
            console.log('Attempting to retrieve minion count...');
            const minionCount = await warden.getMinionCount(); // Access using Comlink's proxy
            console.log(`Minion count retrieved: ${minionCount}`);
            expect(minionCount).toBe(4); // Adjust based on your pool size
        } catch (error) {
            console.error('Error during minion pool initialization test:', error);
            throw error; // Fail the test if an error occurs
        }
    });
    
    afterEach(() => {
         warden.worker.terminate(); 
    });
});
