import Dexie from 'dexie';
import axios from 'axios';
import { Debug } from '../../utils/debug';
import {
  IMapData,
  type Bounds,
  type INPCObjectGPS,
  type GridEngineScene,
} from '../../../types';

class MapDatabase extends Dexie {
  maps: Dexie.Table<IMapData, string>;
  jsonFiles: Dexie.Table<{ tilemapKey: string; jsonData: string }, string>;
  tilesetImages: Dexie.Table<{ tilemapKey: string; imageData: Blob }, string>;

  constructor() {
    super('MapDatabase');
    this.version(1).stores({
      maps: 'tilemapKey',
      jsonFiles: 'tilemapKey',
      tilesetImages: 'tilemapKey',
    });
    this.maps = this.table('maps');
    this.jsonFiles = this.table('jsonFiles');
    this.tilesetImages = this.table('tilesetImages');
  }

  async initializeMapDatabase() {
    const localUrl = '/api/mapdb.json';
    const fallbackUrl = 'https://kbve.com/api/mapdb.json';
    let mapDatabaseJson;

    try {
      const response = await axios.get(localUrl);
      mapDatabaseJson = response.data;
      Debug.log(`Map database loaded from ${localUrl}`);
    } catch (error) {
      Debug.warn(
        `Failed to load map database from ${localUrl}, trying fallback URL.`,
      );
      try {
        const fallbackResponse = await axios.get(fallbackUrl);
        mapDatabaseJson = fallbackResponse.data;
        Debug.log(`Map database loaded from ${fallbackUrl}`);
      } catch (fallbackError) {
        Debug.error(
          `Failed to load map database from both ${localUrl} and ${fallbackUrl}`,
        );
        return;
      }
    }

    if (mapDatabaseJson && mapDatabaseJson.key) {
      for (const tilemapKey in mapDatabaseJson.key) {
        if (
          Object.prototype.hasOwnProperty.call(mapDatabaseJson.key, tilemapKey)
        ) {
          const mapData = mapDatabaseJson.key[tilemapKey];
          await this.addMap(mapData);
          await this.addJsonData(tilemapKey, mapData.jsonDataUrl);
          const tilesetImage = await this.fetchTilesetImage(
            mapData.tilesetImageUrl,
          );
          if (tilesetImage) {
            await this.addTilesetImage(tilemapKey, tilesetImage);
          }
        }
      }
      Debug.log('Map database initialized and data loaded.');
    } else {
      Debug.error('Invalid map database format.');
    }
  }

  // Adding or updating map data
  async addMap(mapData: IMapData) {
    await this.maps.put(mapData);
  }

  // Fetching a map by its key
  async getMap(tilemapKey: string): Promise<IMapData | undefined> {
    return await this.maps.get(tilemapKey);
  }

  // Adding or updating JSON data for a map
  async addJsonData(tilemapKey: string, jsonData: string) {
    await this.jsonFiles.put({ tilemapKey, jsonData });
  }

  // Fetching JSON data for a map
  async getJsonData(tilemapKey: string): Promise<string | undefined> {
    const jsonData = await this.jsonFiles.get(tilemapKey);
    return jsonData?.jsonData;
  }

  // Adding or updating a tileset image for a map
  async addTilesetImage(tilemapKey: string, imageData: Blob) {
    await this.tilesetImages.put({ tilemapKey, imageData });
  }

  // Fetching a tileset image for a map
  async getTilesetImage(tilemapKey: string): Promise<Blob | undefined> {
    const image = await this.tilesetImages.get(tilemapKey);
    return image?.imageData;
  }

  // Fetching the bounds for a map
  async getBounds(tilemapKey: string): Promise<Bounds | undefined> {
    const mapData = await this.maps.get(tilemapKey);
    return mapData?.bounds;
  }

  // Fetching the NPCs for a map
  async getNpcsFromTilesetKey(
    tilesetKey: string,
  ): Promise<INPCObjectGPS[] | undefined> {
    const mapData = await mapDatabase.getMap(tilesetKey);

    if (!mapData) {
      Debug.error(`No map data found for tilesetKey: ${tilesetKey}`);
      return undefined;
    }

    return mapData.npcs;
  }

  // Fetching map data from a URL
  async fetchMapData(url: string): Promise<IMapData | undefined> {
    try {
      const response = await axios.get<IMapData>(url);
      return response.data;
    } catch (error) {
      Debug.error(`Failed to fetch map data from ${url}:`, error);
      return undefined;
    }
  }

  // Fetching JSON data from a URL
  async fetchJsonData(url: string): Promise<string | undefined> {
    try {
      const response = await axios.get<string>(url);
      return response.data;
    } catch (error) {
      Debug.error(`Failed to fetch JSON data from ${url}:`, error);
      return undefined;
    }
  }

  // Fetching a tileset image from a URL
  async fetchTilesetImage(url: string): Promise<Blob | undefined> {
    try {
      const response = await axios.get(url, { responseType: 'blob' });
      return response.data;
    } catch (error) {
      Debug.error(`Failed to fetch tileset image from ${url}:`, error);
      return undefined;
    }
  }

  // Initialize the map database with data from URLs
  async initializeMap(
    tilemapKey: string,
    mapDataUrl: string,
    jsonDataUrl: string,
    tilesetImageUrl: string,
  ) {
    try {
      const mapData = await this.fetchMapData(mapDataUrl);
      if (mapData) {
        await this.addMap(mapData);
        const jsonData = await this.fetchJsonData(jsonDataUrl);
        if (jsonData) {
          await this.addJsonData(tilemapKey, jsonData);
        }
        const tilesetImage = await this.fetchTilesetImage(tilesetImageUrl);
        if (tilesetImage) {
          await this.addTilesetImage(tilemapKey, tilesetImage);
        }
      }
    } catch (error) {
      Debug.error('Failed to initialize map database:', error);
    }
  }

  // Example method to load a map into a Phaser scene
  async loadMapIntoScene(scene: Phaser.Scene, tilemapKey: string) {
    const mapData = await this.getMap(tilemapKey);
    if (!mapData) {
      Debug.error(`Map with key ${tilemapKey} not found`);
      return;
    }

    const jsonData = await this.getJsonData(tilemapKey);
    if (!jsonData) {
      Debug.error(`JSON data for map ${tilemapKey} not found`);
      return;
    }

    const tilesetImage = await this.getTilesetImage(tilemapKey);
    if (!tilesetImage) {
      Debug.error(`Tileset image for map ${tilemapKey} not found`);
      return;
    }

    let tilesetImageUrl: string | null = null;
    try {
      tilesetImageUrl = URL.createObjectURL(tilesetImage);
    } catch (error) {
      Debug.error(`Failed to create object URL for tileset image: ${error}`);
      return;
    }

    // If tilesetImageUrl is still null, something went wrong
    if (!tilesetImageUrl) {
      Debug.error(
        `Tileset image URL for map ${tilemapKey} could not be created.`,
      );
      return;
    }

    // Load the JSON data and tileset image into the Phaser scene
    scene.load.tilemapTiledJSON(tilemapKey, jsonData);
    scene.load.image(mapData.tilesetKey, tilesetImageUrl);

    scene.load.once('complete', () => {
      const map = scene.make.tilemap({ key: tilemapKey });
      const tileset = map.addTilesetImage(
        mapData.tilesetName,
        mapData.tilesetKey,
      );
      if (tileset) {
        // Use the tileset here, now TypeScript knows it's not null
        for (let i = 0; i < map.layers.length; i++) {
          const layer = map.createLayer(i, tileset, 0, 0);
          if (layer) {
            layer.scale = mapData.scale;
          } else {
            Debug.error(`Layer ${i} could not be created.`);
          }
        }
      } else {
        Debug.error(`Tileset ${mapData.tilesetName} could not be created.`);
      }
    });

    scene.load.start();
  }

  async loadMap(
    scene: Phaser.Scene,
    tilemapKey: string,
  ): Promise<Phaser.Tilemaps.Tilemap | null> {
    const mapData = await this.getMap(tilemapKey);
    if (!mapData) {
      throw new Error(`Map with key ${tilemapKey} not found`);
    }

    const jsonData = await this.getJsonData(tilemapKey);
    if (!jsonData) {
      throw new Error(`JSON data for map ${tilemapKey} not found`);
    }

    const tilesetImage = await this.getTilesetImage(tilemapKey);
    if (!tilesetImage) {
      throw new Error(`Tileset image for map ${tilemapKey} not found`);
    }

    let tilesetImageUrl: string | null = null;
    try {
      tilesetImageUrl = URL.createObjectURL(tilesetImage);
    } catch (error) {
      throw new Error(
        `Failed to create object URL for tileset image: ${error}`,
      );
    }

    if (!tilesetImageUrl) {
      throw new Error(
        `Tileset image URL for map ${tilemapKey} could not be created.`,
      );
    }

    // Load the JSON data and tileset image into the Phaser scene
    scene.load.tilemapTiledJSON(tilemapKey, jsonData);
    scene.load.image(mapData.tilesetKey, tilesetImageUrl);

    return new Promise<Phaser.Tilemaps.Tilemap | null>((resolve) => {
      scene.load.once('complete', () => {
        const map = scene.make.tilemap({ key: tilemapKey });
        const tileset = map.addTilesetImage(
          mapData.tilesetName,
          mapData.tilesetKey,
        );
        if (tileset) {
          for (let i = 0; i < map.layers.length; i++) {
            const layer = map.createLayer(i, mapData.tilesetName, 0, 0);
            if (layer) {
              layer.scale = mapData.scale;
            } else {
              console.error(`Layer ${i} could not be created.`);
            }
          }
          resolve(map); // Return the created tilemap
        } else {
          console.error(`Tileset ${mapData.tilesetName} could not be created.`);
          resolve(null);
        }
      });

      scene.load.start();
    });
  }

  
}

// Export the class itself
export { MapDatabase };

// Export a singleton instance
export const mapDatabase = new MapDatabase();
