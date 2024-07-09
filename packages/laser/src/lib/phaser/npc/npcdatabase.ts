import Dexie from 'dexie';
import axios from 'axios';
import { INPCData, ISprite } from '../../../types';

class NPCDatabase extends Dexie {
    npcs: Dexie.Table<INPCData, string>;
    sprites: Dexie.Table<ISprite, string>;

    constructor() {
        super('NPCDatabase');
        this.version(2).stores({
            npcs: 'id',
            sprites: 'id'
        });
        this.npcs = this.table('npcs');
        this.sprites = this.table('sprites');
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

    async addSprite(sprite: ISprite): Promise<void> {
        await this.sprites.put(sprite);
    }

    async getSprite(id: string): Promise<ISprite | undefined> {
        return await this.sprites.get(id);
    }

    async getAllSprites(): Promise<ISprite[]> {
        return await this.sprites.toArray();
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

    async addNewSprite(url: string, spriteDetails: Omit<ISprite, 'spriteData'>): Promise<string | undefined> {
        const spriteBlob = await this.urlToBlob(url);
        if (spriteBlob) {
            const newSprite: ISprite = {
                ...spriteDetails,
                spriteData: spriteBlob
            };
            await this.addSprite(newSprite);
            return newSprite.id;
        }
        return undefined;
    }

    async addNewNPC(npcDetails: Omit<INPCData, 'spriteImageId'>, spriteImageId: string): Promise<void> {
        const newNPC: INPCData = {
            ...npcDetails,
            spriteImageId
        };
        await this.addNPC(newNPC);
    }
}

export const npcDatabase = new NPCDatabase();
