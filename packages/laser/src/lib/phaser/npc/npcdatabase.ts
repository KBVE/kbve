import Dexie from 'dexie';
import axios from 'axios';
import { INPCData, ISprite, IAvatar } from '../../../types';

class NPCDatabase extends Dexie {
    npcs: Dexie.Table<INPCData, string>;
    sprites: Dexie.Table<ISprite, string>;
    avatars: Dexie.Table<IAvatar, string>;

    constructor() {
        super('NPCDatabase');
        this.version(3).stores({
            npcs: 'id',
            sprites: 'id',
            avatars: 'id'
        });
        this.npcs = this.table('npcs');
        this.sprites = this.table('sprites');
        this.avatars = this.table('avatars');
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

    async addAvatar(avatar: IAvatar): Promise<void> {
        await this.avatars.put(avatar);
    }

    async getAvatar(id: string): Promise<IAvatar | undefined> {
        return await this.avatars.get(id);
    }

    async getAllAvatars(): Promise<IAvatar[]> {
        return await this.avatars.toArray();
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

    async addNewNPC(npcDetails: Omit<INPCData, 'spriteImageId' | 'avatarImageId'>, spriteImageId: string, avatarImageId: string): Promise<void> {
        const newNPC: INPCData = {
            ...npcDetails,
            spriteImageId,
            avatarImageId
        };
        await this.addNPC(newNPC);
    }

    async addNewAvatar(url: string, avatarDetails: Omit<IAvatar, 'avatarData'>): Promise<string | undefined> {
        const avatarBlob = await this.urlToBlob(url);
        if (avatarBlob) {
            const newAvatar: IAvatar = {
                ...avatarDetails,
                avatarData: avatarBlob
            };
            await this.addAvatar(newAvatar);
            return newAvatar.id;
        }
        return undefined;
    }

    async fetchAvatars(url: string): Promise<void> {
        try {
            const response = await axios.get(url);
            const avatars = response.data.key;
            for (const key in avatars) {
                const avatarDetails = avatars[key];
                let avatarBlob = await this.urlToBlob(avatarDetails.avatarLocation);
                if (!avatarBlob) {
                    avatarBlob = await this.urlToBlob(`https://kbve.com${avatarDetails.avatarLocation}`);
                }
                if (avatarBlob) {
                    const newAvatar: IAvatar = {
                        id: avatarDetails.id,
                        avatarName: avatarDetails.avatarName,
                        avatarLocation: avatarDetails.avatarLocation,
                        avatarData: avatarBlob,
                        slug: avatarDetails.slug
                    };
                    await this.addAvatar(newAvatar);
                }
            }
        } catch (error) {
            console.error(`Failed to fetch avatars from ${url}:`, error);
        }
    }

    async fetchSprites(url: string): Promise<void> {
        try {
            const response = await axios.get(url);
            const sprites = response.data.key;
            for (const key in sprites) {
                const spriteDetails = sprites[key];
                let spriteBlob = await this.urlToBlob(spriteDetails.assetLocation);
                if (!spriteBlob) {
                    spriteBlob = await this.urlToBlob(`https://kbve.com${spriteDetails.assetLocation}`);
                }
                if (spriteBlob) {
                    const newSprite: ISprite = {
                        id: spriteDetails.id,
                        spriteName: spriteDetails.spriteName,
                        assetLocation: spriteDetails.assetLocation,
                        frameWidth: spriteDetails.frameWidth,
                        frameHeight: spriteDetails.frameHeight,
                        scale: spriteDetails.scale,
                        slug: spriteDetails.slug,
                        spriteData: spriteBlob
                    };
                    await this.addSprite(newSprite);
                }
            }
        } catch (error) {
            console.error(`Failed to fetch sprites from ${url}:`, error);
        }
    }

    async fetchNPCs(url: string): Promise<void> {
        try {
            const response = await axios.get(url);
            const npcs = response.data.key;
            for (const key in npcs) {
                const npcDetails = npcs[key];
                const newNPC: INPCData = {
                    id: npcDetails.id,
                    name: npcDetails.name,
                    spriteKey: npcDetails.spriteKey,
                    walkingAnimationMapping: npcDetails.walkingAnimationMapping,
                    startPosition: npcDetails.startPosition,
                    speed: npcDetails.speed,
                    scale: npcDetails.scale,
                    slug: npcDetails.slug,
                    actions: npcDetails.actions,
                    effects: npcDetails.effects,
                    stats: npcDetails.stats,
                    spriteImageId: npcDetails.spriteImageId,
                    avatarImageId: npcDetails.avatarImageId
                };
                await this.addNPC(newNPC);
            }
        } catch (error) {
            console.error(`Failed to fetch NPCs from ${url}:`, error);
        }
    }

    async initializeDatabase(baseURL = 'https://kbve.com') {
        // Fetch and add all avatars from the given URL
        await this.fetchAvatars(`${baseURL}/api/avatardb.json`);

        // Fetch and add all sprites from the given URL
        await this.fetchSprites(`${baseURL}/api/spritedb.json`);

        // Fetch and add all NPCs from the given URL
        await this.fetchNPCs(`${baseURL}/api/npcdb.json`);
    }
}

// Export the class itself
export { NPCDatabase };

// Export a singleton instance
export const npcDatabase = new NPCDatabase();
