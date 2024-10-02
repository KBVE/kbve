//  mapdatabase.ts
//  [IMPORTS]
import Dexie from 'dexie';
import axios from 'axios';
import { Debug } from '../../utils/debug';
import { IMapData, type Bounds, type INPCObjectGPS } from '../../../types';

/**
 * Represents a Dexie-based database for managing maps, JSON files, and tileset images.
 * Provides methods for adding, retrieving, and updating map-related data.
 */
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

	/**
	 * Initializes the map database with data from local or fallback URLs.
	 * Attempts to load the map database JSON, adding maps, JSON data, and tileset images.
	 */
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
					Object.prototype.hasOwnProperty.call(
						mapDatabaseJson.key,
						tilemapKey,
					)
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

	/**
	 * Adds or updates a map in the database.
	 * @param {IMapData} mapData - The map data to be added or updated.
	 */
	async addMap(mapData: IMapData) {
		await this.maps.put(mapData);
	}

	/**
	 * Retrieves a map by its key from the database.
	 * @param {string} tilemapKey - The unique key identifying the map.
	 * @returns {Promise<IMapData | undefined>} The map data, if found.
	 */
	async getMap(tilemapKey: string): Promise<IMapData | undefined> {
		return await this.maps.get(tilemapKey);
	}

	/**
	 * Adds or updates JSON data for a map.
	 * @param {string} tilemapKey - The unique key identifying the map.
	 * @param {string} jsonData - The JSON data to be stored.
	 */
	async addJsonData(tilemapKey: string, jsonData: string) {
		await this.jsonFiles.put({ tilemapKey, jsonData });
	}

	/**
	 * Retrieves JSON data for a map by its key.
	 * @param {string} tilemapKey - The unique key identifying the map.
	 * @returns {Promise<string | undefined>} The JSON data, if found.
	 */
	async getJsonData(tilemapKey: string): Promise<string | undefined> {
		const jsonData = await this.jsonFiles.get(tilemapKey);
		return jsonData?.jsonData;
	}

	/**
	 * Adds or updates a tileset image for a map.
	 * @param {string} tilemapKey - The unique key identifying the map.
	 * @param {Blob} imageData - The image data to be stored.
	 */
	async addTilesetImage(tilemapKey: string, imageData: Blob) {
		await this.tilesetImages.put({ tilemapKey, imageData });
	}

	/**
	 * Retrieves a tileset image for a map by its key.
	 * @param {string} tilemapKey - The unique key identifying the map.
	 * @returns {Promise<Blob | undefined>} The tileset image, if found.
	 */
	async getTilesetImage(tilemapKey: string): Promise<Blob | undefined> {
		const image = await this.tilesetImages.get(tilemapKey);
		return image?.imageData;
	}

	/**
	 * Fetches the bounds for a given map by its tilemap key.
	 * The bounds represent the rectangular area of the map.
	 *
	 * @param {string} tilemapKey - The unique key identifying the map.
	 * @returns {Promise<Bounds | undefined>} The bounds of the map if found, otherwise `undefined`.
	 */
	async getBounds(tilemapKey: string): Promise<Bounds | undefined> {
		const mapData = await this.maps.get(tilemapKey);
		return mapData?.bounds;
	}

	/**
	 * Retrieves the NPCs (Non-Player Characters) for a given map based on the tileset key.
	 * Returns an array of NPC objects if they exist in the map data.
	 *
	 * @param {string} tilesetKey - The unique key identifying the tileset.
	 * @returns {Promise<INPCObjectGPS[] | undefined>} An array of NPC objects if found, otherwise `undefined`.
	 */
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

	/**
	 * Fetches map data from a given URL.
	 * The map data is expected to conform to the `IMapData` interface.
	 *
	 * @param {string} url - The URL from which to fetch the map data.
	 * @returns {Promise<IMapData | undefined>} The map data if successfully fetched, otherwise `undefined`.
	 */
	async fetchMapData(url: string): Promise<IMapData | undefined> {
		try {
			const response = await axios.get<IMapData>(url);
			return response.data;
		} catch (error) {
			Debug.error(`Failed to fetch map data from ${url}:`, error);
			return undefined;
		}
	}

	/**
	 * Fetches JSON data from a given URL.
	 * The JSON data is expected to be a string representing the map structure or configuration.
	 *
	 * @param {string} url - The URL from which to fetch the JSON data.
	 * @returns {Promise<string | undefined>} The JSON data if successfully fetched, otherwise `undefined`.
	 */
	async fetchJsonData(url: string): Promise<string | undefined> {
		try {
			const response = await axios.get<string>(url);
			return response.data;
		} catch (error) {
			Debug.error(`Failed to fetch JSON data from ${url}:`, error);
			return undefined;
		}
	}

	/**
	 * Fetches a tileset image from a given URL.
	 * The tileset image is returned as a Blob, which can be used in rendering the map.
	 *
	 * @param {string} url - The URL from which to fetch the tileset image.
	 * @returns {Promise<Blob | undefined>} The tileset image as a Blob if successfully fetched, otherwise `undefined`.
	 */
	async fetchTilesetImage(url: string): Promise<Blob | undefined> {
		try {
			const response = await axios.get(url, { responseType: 'blob' });
			return response.data;
		} catch (error) {
			Debug.error(`Failed to fetch tileset image from ${url}:`, error);
			return undefined;
		}
	}

	/**
	 * Initializes the map database by fetching map, JSON, and tileset image data from the provided URLs.
	 * This method sequentially adds the map data, JSON data, and tileset image to the Dexie-based database.
	 *
	 * @param {string} tilemapKey - The unique key identifying the tilemap.
	 * @param {string} mapDataUrl - The URL from which to fetch the map data.
	 * @param {string} jsonDataUrl - The URL from which to fetch the JSON data.
	 * @param {string} tilesetImageUrl - The URL from which to fetch the tileset image.
	 * @returns {Promise<void>} Resolves when the map database has been successfully initialized.
	 */
	async initializeMap(
		tilemapKey: string,
		mapDataUrl: string,
		jsonDataUrl: string,
		tilesetImageUrl: string,
	): Promise<void> {
		try {
			const mapData = await this.fetchMapData(mapDataUrl);
			if (mapData) {
				await this.addMap(mapData);
				const jsonData = await this.fetchJsonData(jsonDataUrl);
				if (jsonData) {
					await this.addJsonData(tilemapKey, jsonData);
				}
				const tilesetImage =
					await this.fetchTilesetImage(tilesetImageUrl);
				if (tilesetImage) {
					await this.addTilesetImage(tilemapKey, tilesetImage);
				}
			}
		} catch (error) {
			Debug.error('Failed to initialize map database:', error);
		}
	}

	/**
	 * Loads a specified map into a Phaser scene.
	 * The method retrieves map data, JSON data, and the tileset image using the provided tilemap key,
	 * and then loads the data into the specified Phaser scene.
	 *
	 * @param {Phaser.Scene} scene - The Phaser scene into which the map will be loaded.
	 * @param {string} tilemapKey - The unique key identifying the map to be loaded.
	 *
	 * @remarks
	 * - This method assumes that `tilemapTiledJSON` and `image` loaders are available in the Phaser scene.
	 * - The method uses `URL.createObjectURL` to generate a temporary URL for the tileset image Blob.
	 * - If the map data, JSON data, or tileset image is missing, an error will be logged and the method will return early.
	 *
	 * @returns {Promise<void>} Resolves once the map and its assets are loaded into the Phaser scene.
	 *
	 * @throws Will throw an error if the tileset image URL cannot be created or if any critical data is missing.
	 *
	 * @example
	 * ```typescript
	 * const myScene = new Phaser.Scene('MyScene');
	 * await mapDatabase.loadMapIntoScene(myScene, 'myTilemapKey');
	 * ```
	 */
	async loadMapIntoScene(
		scene: Phaser.Scene,
		tilemapKey: string,
	): Promise<void> {
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
			Debug.error(
				`Failed to create object URL for tileset image: ${error}`,
			);
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
				Debug.error(
					`Tileset ${mapData.tilesetName} could not be created.`,
				);
			}
		});

		scene.load.start();
	}

	/**
	 * Loads a specified map into a Phaser scene and returns the created tilemap.
	 * This method fetches the map data, JSON data, and tileset image using the provided tilemap key,
	 * and then loads the data into the specified Phaser scene.
	 *
	 * @param {Phaser.Scene} scene - The Phaser scene into which the map will be loaded.
	 * @param {string} tilemapKey - The unique key identifying the map to be loaded.
	 *
	 * @returns {Promise<Phaser.Tilemaps.Tilemap | null>} A promise that resolves to the created `Phaser.Tilemaps.Tilemap` object if the loading is successful, otherwise `null`.
	 *
	 * @throws {Error} Throws an error if the map data, JSON data, or tileset image cannot be found or loaded.
	 *
	 * @remarks
	 * - The method will throw an error and halt execution if any critical data (map, JSON, or tileset image) is missing.
	 * - Uses `URL.createObjectURL` to create a temporary URL for the tileset image Blob.
	 * - The method internally uses Phaser's `tilemapTiledJSON` and `image` loaders, so make sure these loaders are available in the Phaser scene.
	 *
	 * @example
	 * ```typescript
	 * const scene = new Phaser.Scene('MyGameScene');
	 * const tilemap = await mapDatabase.loadMap(scene, 'tilemapKey123');
	 * if (tilemap) {
	 *   console.log('Tilemap successfully loaded into the scene.');
	 * } else {
	 *   console.error('Failed to load the tilemap.');
	 * }
	 * ```
	 */
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
						const layer = map.createLayer(
							i,
							mapData.tilesetName,
							0,
							0,
						);
						if (layer) {
							layer.scale = mapData.scale;
						} else {
							console.error(`Layer ${i} could not be created.`);
						}
					}
					resolve(map); // Return the created tilemap
				} else {
					console.error(
						`Tileset ${mapData.tilesetName} could not be created.`,
					);
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
