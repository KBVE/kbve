import Dexie from 'dexie';
import axios from 'axios';
import { atom, WritableAtom } from 'nanostores';
import { INPCData, ISprite, IAvatar, IDialogueObject } from '../../../types';
import { Scene } from 'phaser';
import { npcHandler } from './npchandler';

import { Debug } from '../../utils/debug';


// Extending the Phaser.Scene type to include gridEngine
interface ExtendedScene extends Scene {
  gridEngine: any;
}

class NPCDatabase extends Dexie {
  npcs: Dexie.Table<INPCData, string>;
  sprites: Dexie.Table<ISprite, string>;
  avatars: Dexie.Table<IAvatar, string>;
  dialogues: Dexie.Table<IDialogueObject, string>;

  constructor() {
    super('NPCDatabase');
    this.version(3).stores({
      npcs: 'id,name',
      sprites: 'id',
      avatars: 'id',
      dialogues: 'id',
    });
    this.npcs = this.table('npcs');
    this.sprites = this.table('sprites');
    this.avatars = this.table('avatars');
    this.dialogues = this.table('dialogues');
  }

  async addNPC(npcData: INPCData) {
    await this.npcs.put(npcData);
  }

  async getNPC(id: string): Promise<INPCData | undefined> {
    return await this.npcs.get(id);
  }

  async getNPCByName(name: string): Promise<INPCData | undefined> {
    return await this.npcs.where('name').equals(name).first();
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
      Debug.error(`Failed to fetch NPC data from ${url}:`, error);
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
      Debug.error(`Failed to fetch blob from ${url}:`, error);
      return undefined;
    }
  }

  async addNewSprite(
    url: string,
    spriteDetails: Omit<ISprite, 'spriteData'>,
  ): Promise<string | undefined> {
    const spriteBlob = await this.urlToBlob(url);
    if (spriteBlob) {
      const newSprite: ISprite = {
        ...spriteDetails,
        spriteData: spriteBlob,
      };
      await this.addSprite(newSprite);
      return newSprite.id;
    }
    return undefined;
  }

  async addNewNPC(
    npcDetails: Omit<INPCData, 'spriteImageId' | 'avatarImageId'>,
    spriteImageId: string,
    avatarImageId: string,
  ): Promise<void> {
    const newNPC: INPCData = {
      ...npcDetails,
      spriteImageId,
      avatarImageId,
    };
    await this.addNPC(newNPC);
  }

  async addNewAvatar(
    url: string,
    avatarDetails: Omit<IAvatar, 'avatarData'>,
  ): Promise<string | undefined> {
    const avatarBlob = await this.urlToBlob(url);
    if (avatarBlob) {
      const newAvatar: IAvatar = {
        ...avatarDetails,
        avatarData: avatarBlob,
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
          avatarBlob = await this.urlToBlob(
            `https://kbve.com${avatarDetails.avatarLocation}`,
          );
        }
        if (avatarBlob) {
          const newAvatar: IAvatar = {
            id: avatarDetails.id,
            avatarName: avatarDetails.avatarName,
            avatarLocation: avatarDetails.avatarLocation,
            avatarData: avatarBlob,
            slug: avatarDetails.slug,
          };
          await this.addAvatar(newAvatar);
        }
      }
    } catch (error) {
      Debug.error(`Failed to fetch avatars from ${url}:`, error);
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
          spriteBlob = await this.urlToBlob(
            `https://kbve.com${spriteDetails.assetLocation}`,
          );
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
            spriteData: spriteBlob,
          };
          await this.addSprite(newSprite);
        }
      }
    } catch (error) {
      Debug.error(`Failed to fetch sprites from ${url}:`, error);
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
          avatarImageId: npcDetails.avatarImageId,
          dialogues: npcDetails.dialogues || [],
        };
        await this.addNPC(newNPC);
      }
    } catch (error) {
      Debug.error(`Failed to fetch NPCs from ${url}:`, error);
    }
  }

  async initializeDatabase(baseURL = 'https://kbve.com') {
    // Fetch, add and prepare.
    await this.fetchAvatars(`${baseURL}/api/avatardb.json`);
    await this.fetchSprites(`${baseURL}/api/spritedb.json`);
    await this.fetchNPCs(`${baseURL}/api/npcdb.json`);

    // TODO: Fetch dialogues from the given URL
    await this.fetchDialogues(`${baseURL}/api/dialogue.json`);
  }

  async loadNPC(
    scene: ExtendedScene,
    npcName: string,
    x?: number,
    y?: number,
  ): Promise<void> {
    try {
      Debug.log(`Loading NPC with name: ${npcName}`);
      const npcData = await this.getNPCByName(npcName);
      if (!npcData) {
        throw new Error(`NPC with name ${npcName} not found`);
      }
      Debug.log(`NPC Data: ${JSON.stringify(npcData)}`);

      await this.loadCharacter(scene, npcData.id, x, y);
    } catch (error) {
      if (error instanceof Error) {
        Debug.error(`Failed to load NPC: ${error.message}`);
      } else {
        Debug.error('Failed to load NPC:', error);
      }
    }
  }

  async loadCharacter(
    scene: ExtendedScene,
    npcId: string,
    x?: number,
    y?: number,
  ): Promise<void> {
    try {
      Debug.log(`Loading NPC with ID: ${npcId}`);
      const npcData = await this.getNPC(npcId);
      if (!npcData) {
        throw new Error(`NPC with ID ${npcId} not found`);
      }
      Debug.log(`NPC Data: ${JSON.stringify(npcData)}`);

      const textureKey = npcData.spriteKey;

      // Ensure the texture is loaded
      if (!scene.textures.exists(textureKey)) {
        Debug.log(
          `Texture with key ${textureKey} not found, attempting to load.`,
        );
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const spriteData = await this.getSprite(npcData.spriteImageId!);
        if (spriteData && spriteData.spriteData) {
          Debug.log(`Sprite Data: ${JSON.stringify(spriteData)}`);
          const url = URL.createObjectURL(spriteData.spriteData);

          // Load the spritesheet using frameWidth and frameHeight from spriteData
          scene.load.spritesheet(textureKey, url, {
            frameWidth: spriteData.frameWidth,
            frameHeight: spriteData.frameHeight,
          });

          scene.load.once('complete', () => {
            Debug.log(`Texture ${textureKey} loaded successfully.`);
            this.addNPCToScene(scene, npcData, x, y);
          });

          scene.load.start();
        } else {
          throw new Error(`Sprite with ID ${npcData.spriteImageId} not found`);
        }
      } else {
        Debug.log(`Texture with key ${textureKey} already loaded.`);
        this.addNPCToScene(scene, npcData, x, y);
      }
    } catch (error) {
      if (error instanceof Error) {
        Debug.error(`Failed to load NPC: ${error.message}`);
      } else {
        Debug.error('Failed to load NPC:', error);
      }
    }
  }

  addNPCToScene(
    scene: ExtendedScene,
    npcData: INPCData,
    x?: number,
    y?: number,
  ): void {
    try {
      Debug.log(`Adding NPC to scene: ${JSON.stringify(npcData)}`);
      Debug.log(`Using sprite key: ${npcData.spriteKey}`);

      //const npcSprite = scene.add.sprite(x ?? npcData.startPosition.x, y ?? npcData.startPosition.y, npcData.spriteKey);
      const npcSprite = scene.add.sprite(0, 0, npcData.spriteKey);

      npcSprite.scale = npcData.scale || 1.5;
      npcSprite.name = npcData.id || 'Error Missing Name';

      Debug.log(
        `NPC Sprite created with texture key ${npcData.spriteKey} at position (${npcData.startPosition.x}, ${npcData.startPosition.y})`,
      );

      const gridEngineConfig = {
        id: npcData.id,
        sprite: npcSprite,
        walkingAnimationMapping: npcData.walkingAnimationMapping,
        startPosition: {
          x: x ?? npcData.startPosition.x,
          y: y ?? npcData.startPosition.y,
        },
        speed: npcData.speed,
      };

      Debug.log(`Grid engine config: ${JSON.stringify(gridEngineConfig)}`);

      // Check if the texture is available before adding to grid engine
      if (!scene.textures.exists(npcData.spriteKey)) {
        throw new Error(
          `Texture with key ${npcData.spriteKey} does not exist in the scene`,
        );
      }

      scene.gridEngine.addCharacter(gridEngineConfig);

      Debug.log(`NPC added to grid engine with ID ${npcData.id}`);

      const attachNPCEventWithCoords = (
        sprite: Phaser.GameObjects.Sprite,
        title: string,
        actions: { label: string }[],
      ) => {
        const position = scene.gridEngine.getPosition(sprite.name);
        Debug.log(
          `Attaching NPC events to ${title} at position: ${JSON.stringify(position)}`,
        );
        npcHandler.attachNPCEvent(sprite, title, actions, { coords: position });
      };

      attachNPCEventWithCoords(
        npcSprite,
        npcData.name,
        npcData.actions.map((action) => ({ label: action })),
      );

      Debug.log(`NPC ${npcData.name} added to scene successfully`);
    } catch (error) {
      if (error instanceof Error) {
        Debug.error(
          `Error adding NPC to scene from addNPCToScene: ${error.message}`,
        );
      } else {
        Debug.error('Error adding NPC to scene:', error);
      }
    }
  }

  //? Dialogue Scoped Functions
  async addDialogue(dialogue: IDialogueObject) {
    await this.dialogues.put(dialogue);
  }

  async getDialogue(id: string): Promise<IDialogueObject | undefined> {
    return await this.dialogues.get(id);
  }

  async getAllDialogues(): Promise<IDialogueObject[]> {
    return await this.dialogues.toArray();
  }

  async getDialoguesForNPC(npcId: string): Promise<IDialogueObject[]> {
    const npc = await this.getNPC(npcId);
    if (!npc) throw new Error(`NPC with ID ${npcId} not found`);
    const dialogues = await Promise.all(
      (npc.dialogues || []).map((dialogue) =>
        this.getDialogue(dialogue.dialogueId),
      ),
    );
    return dialogues.filter(
      (dialogue) => dialogue !== undefined,
    ) as IDialogueObject[];
  }

  async markDialogueAsRead(npcId: string, dialogueId: string): Promise<void> {
    const npc = await this.getNPC(npcId);
    if (!npc) throw new Error(`NPC with ID ${npcId} not found`);
    const dialogue = npc.dialogues?.find((d) => d.dialogueId === dialogueId);
    if (dialogue) {
      dialogue.read = true;
      await this.addNPC(npc);
    }
  }

  async fetchDialogues(url: string): Promise<void> {
    try {
      const response = await axios.get(url);
      const dialogues = response.data.key;
      const newDialogues = Object.values(dialogues).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (dialogueDetails: any) => ({ ...dialogueDetails }),
      );
      await this.dialogues.bulkPut(newDialogues);
    } catch (error) {
      Debug.error(`Failed to fetch dialogues from ${url}:`, error);
    }
  }

  async getPrioritizedDialoguesForNPC(npcId: string): Promise<(IDialogueObject & { priority: number; read: boolean })[]> {
    try {
      const npc = await this.getNPC(npcId);
      if (!npc) throw new Error(`NPC with ID ${npcId} not found`);
  
      const dialoguesWithMetadata = await Promise.all(
        (npc.dialogues || []).map(async dialogueMeta => {
          const dialogue = await this.getDialogue(dialogueMeta.dialogueId);
          if (dialogue) {
            return {
              ...dialogue,
              priority: dialogueMeta.priority,
              read: dialogueMeta.read,
            };
          }
          return null;
        })
      );
  
      // Filter out any null values
      const validDialogues = dialoguesWithMetadata.filter(dialogue => dialogue !== null) as (IDialogueObject & { priority: number; read: boolean })[];
  
      // Sort the dialogues by priority in descending order
      validDialogues.sort((a, b) => b.priority - a.priority);
  
      return validDialogues;
    } catch (error) {
      Debug.error(`Failed to get prioritized dialogues for NPC with ID ${npcId}:`, error);
      return [];
    }
  }
  

  async getNPCNameById(npcId: string): Promise<string | undefined> {
    const npc = await this.getNPC(npcId);
    return npc?.name;
  }
  
  async getNPCAvatarById(npcId: string): Promise<Blob | undefined> {
    const npc = await this.getNPC(npcId);
    if (npc?.avatarImageId) {
      const avatar = await this.getAvatar(npc.avatarImageId);
      return avatar?.avatarData;
    }
    return undefined;
  }

  async getNPCSlugById(npcId: string): Promise<string | undefined> {
    const npc = await this.getNPC(npcId);
    return npc?.slug;
  }

  async getNPCHealthById(npcId: string): Promise<string | undefined> {
    try {
      const npc = await this.getNPC(npcId);
      return npc?.stats?.health;
    } catch (error) {
      Debug.error(`Failed to get health for NPC with ID ${npcId}:`, error);
      return undefined;
    }
  }

  async getNPCManaById(npcId: string): Promise<string | undefined> {
    try {
      const npc = await this.getNPC(npcId);
      return npc?.stats?.mana;
    } catch (error) {
      Debug.error(`Failed to get mana for NPC with ID ${npcId}:`, error);
      return undefined;
    }
  }

  async createNPCSession(SessionAtom: WritableAtom<Record<string, string>>, npcId: string): Promise<void> {
    try {
      const namePromise = this.getNPCNameById(npcId);
      const slugPromise = this.getNPCSlugById(npcId);
      const avatarPromise = this.getNPCAvatarById(npcId);
      const hpPromise = this.getNPCHealthById(npcId);
      const manaPromise = this.getNPCManaById(npcId);


      const [name, slug, avatar, hp, mana] = await Promise.all([namePromise, slugPromise, avatarPromise, hpPromise, manaPromise]);

      const newSession = { 
        ...SessionAtom.get(), 
        [`${npcId}_name`]: name || 'Unknown', 
        [`${npcId}_slug`]: slug || 'Unknown', 
        [`${npcId}_avatar`]: avatar ? URL.createObjectURL(avatar) : 'Unknown',
        [`${npcId}_health`]: hp || '100',
        [`${npcId}_mana`]: mana || '100',

      };

      SessionAtom.set(newSession);
    } catch (error) {
      const newSession = { 
        ...SessionAtom.get(), 
        [`${npcId}_name`]: 'Unknown', 
        [`${npcId}_slug`]: 'Unknown', 
        [`${npcId}_avatar`]: 'Unknown',
        [`${npcId}_hp`]: '100',
        [`${npcId}_mana`]: '100',

      };
      SessionAtom.set(newSession);
    }
  }

  async getNPCDialogueOptionsByULID(dialogueId: string): Promise<string> {
    try {
      const dialogueOptions = await this.getAllDialogueOptions(dialogueId);
      return JSON.stringify(dialogueOptions);
    } catch (error) {
      Debug.error(`Failed to get dialogue options for ID ${dialogueId}:`, error);
      return '[]';
    }
  }


  async getAllDialogueOptions(dialogueId: string): Promise<IDialogueObject[]> {
    const result: IDialogueObject[] = [];
    const visited: Set<string> = new Set();

    const traverseDialogueOptions = async (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const dialogue = await this.getDialogue(id);
      if (!dialogue) return;

      result.push(dialogue);

      if (dialogue.options && dialogue.options.length > 0) {
        for (const optionId of dialogue.options) {
          await traverseDialogueOptions(optionId);
        }
      }
    };

    await traverseDialogueOptions(dialogueId);

    return result;
  }

  async createDialogueSession(DialogueSessionAtom: WritableAtom<Record<string, string>>, dialogueId: string): Promise<void> {
    try {
      const dialogueOptions = await this.getNPCDialogueOptionsByULID(dialogueId);
      const newDialogueSession = { 
        ...DialogueSessionAtom.get(), 
        [`${dialogueId}_options`]: dialogueOptions || '[]', 
      };
      DialogueSessionAtom.set(newDialogueSession);
    } catch (error) {
      const newDialogueSession = { 
        ...DialogueSessionAtom.get(), 
        [`${dialogueId}_options`]: '[]', 
      };
      DialogueSessionAtom.set(newDialogueSession);
    }
  }

}

// Export the class itself
export { NPCDatabase };

// Export a singleton instance
export const npcDatabase = new NPCDatabase();
