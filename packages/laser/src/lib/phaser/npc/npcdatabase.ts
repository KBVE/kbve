import Dexie from 'dexie';
import axios from 'axios';
import { INPCData } from '../../../types';

class NPCDatabase extends Dexie {
    npcs: Dexie.Table<INPCData, string>;

    constructor() {
        super('NPCDatabase');
        this.version(1).stores({
            npcs: 'id'
        });
        this.npcs = this.table('npcs');
    }

    async addNPC(npcData: INPCData) {
        await this.npcs.put(npcData);
    }

    async getNPC(id: string): Promise<INPCData | undefined> {
        return await this.npcs.get(id);
    }

    async getAllNPCs(): Promise<INPCData[]> {
        return await this.npcs.toArray();
    }

    async exportNPCs(): Promise<string> {
        const npcs = await this.getAllNPCs();
        return JSON.stringify(npcs, null, 2);
    }

    async importNPCs(jsonData: string) {
        const npcArray: INPCData[] = JSON.parse(jsonData);
        await this.npcs.bulkPut(npcArray);
    }

    async fetchNPCData(url: string): Promise<INPCData | undefined> {
        try {
            const response = await axios.get<INPCData>(url);
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch NPC data from ${url}:`, error);
            return undefined;
        }
    }

    async urlToBlob(url: string): Promise<Blob | undefined> {
        try {
            const response = await axios.get(url, { responseType: 'blob' });
            return response.data;
        } catch (error) {
            console.error(`Failed to fetch blob from ${url}:`, error);
            return undefined;
        }
    }
}

export const npcDatabase = new NPCDatabase();
