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
	chunks: Dexie.Table<
		{
			tilemapKey: string;
			chunkX: number;
			chunkY: number;
			jsonData: string;
			imageData?: Blob;
		},
		[string, number, number]
	>;

	//	Map Settings - quick access to avoid calling dexie.
	nbChunksX = 0;
	nbChunksY = 0;
	chunkWidth = 0;
	chunkHeight = 0;
	displayedChunks: Set<number> = new Set();

	constructor() {
		super('MapDatabase');
		this.version(1).stores({
			maps: 'tilemapKey',
			jsonFiles: 'tilemapKey',
			tilesetImages: 'tilemapKey',
			chunks: '[tilemapKey+chunkX+chunkY]',
		});
		this.maps = this.table('maps');
		this.jsonFiles = this.table('jsonFiles');
		this.tilesetImages = this.table('tilesetImages');
		this.chunks = this.table('chunks');
	}

	/**
	 * Resets map-related variables for safety before loading a new map.
	 */
	resetMapSettings() {
		this.nbChunksX = 0;
		this.nbChunksY = 0;
		this.chunkWidth = 0;
		this.chunkHeight = 0;
		this.displayedChunks.clear();
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

	//** Map Chunking */
	/**
	 * Adds a chunk to the database with a reference to its parent map.
	 * @param {string} tilemapKey - The map identifier.
	 * @param {number} chunkX - The X coordinate of the chunk.
	 * @param {number} chunkY - The Y coordinate of the chunk.
	 * @param {string} jsonData - JSON data specific to the chunk.
	 * @param {Blob} [imageData] - Optional image data for the chunk's tileset.
	 */
	async addChunk(
		tilemapKey: string,
		chunkX: number,
		chunkY: number,
		jsonData: string,
		imageData?: Blob,
	) {
		await this.chunks.put({
			tilemapKey,
			chunkX,
			chunkY,
			jsonData,
			imageData,
		});
	}

	/**
	 * Retrieves a specific chunk by its coordinates within a map.
	 * @param {string} tilemapKey - The map identifier.
	 * @param {number} chunkX - The X coordinate of the chunk.
	 * @param {number} chunkY - The Y coordinate of the chunk.
	 * @returns {Promise<{ jsonData: string; imageData?: Blob } | undefined>} The chunk data if found.
	 */
	async getChunk(
		tilemapKey: string,
		chunkX: number,
		chunkY: number,
	): Promise<{ jsonData: string; imageData?: Blob } | undefined> {
		return await this.chunks.get([tilemapKey, chunkX, chunkY]);
	}

	/**
	 * Removes a specific chunk from the database using a compound key array.
	 * @param {string} tilemapKey - The map identifier.
	 * @param {number} chunkX - The X coordinate of the chunk.
	 * @param {number} chunkY - The Y coordinate of the chunk.
	 * @returns {Promise<void>} A promise that resolves once the chunk is removed.
	 */
	async removeChunk(
		tilemapKey: string,
		chunkX: number,
		chunkY: number,
	): Promise<void> {
		await this.chunks.delete([tilemapKey, chunkX, chunkY]);
	}

	/**
	 * Removes multiple chunks that are no longer needed (e.g., out-of-view chunks).
	 * @param {string} tilemapKey - The map identifier.
	 * @param {Array<{ chunkX: number; chunkY: number }>} chunkCoords - Array of chunk coordinates to remove.
	 * @returns {Promise<void>} A promise that resolves once all specified chunks are removed.
	 */
	async removeChunks(
		tilemapKey: string,
		chunkCoords: Array<{ chunkX: number; chunkY: number }>,
	): Promise<void> {
		const removalPromises = chunkCoords.map(({ chunkX, chunkY }) =>
			this.removeChunk(tilemapKey, chunkX, chunkY),
		);
		await Promise.all(removalPromises);
	}

	private async extractChunkJsonData(
		tilemapKey: string,
		chunkX: number,
		chunkY: number,
		chunkSize: number,
	): Promise<string> {
		// Retrieve the full JSON data for the map from jsonFiles table
		const jsonFileEntry = await this.jsonFiles.get(tilemapKey);
		if (!jsonFileEntry) {
			Debug.error(`JSON data for map ${tilemapKey} not found`);
			return '';
		}

		const fullTileData = JSON.parse(jsonFileEntry.jsonData); // Assume jsonData holds the entire map JSON

		// Calculate the start and end indices for the chunk
		const startX = chunkX * chunkSize;
		const startY = chunkY * chunkSize;
		const endX = Math.min(startX + chunkSize, fullTileData.width); // Ensure we don't exceed map bounds
		const endY = Math.min(startY + chunkSize, fullTileData.height);

		// Extract the tile data within the chunk's bounds
		const chunkTileData = [];
		for (let y = startY; y < endY; y++) {
			const row = fullTileData.layers[0].data.slice(
				y * fullTileData.width + startX,
				y * fullTileData.width + endX,
			);
			chunkTileData.push(...row);
		}

		// Construct a chunk-specific JSON structure
		const chunkJson = {
			width: endX - startX,
			height: endY - startY,
			layers: [
				{
					...fullTileData.layers[0],
					data: chunkTileData,
				},
			],
			tilesets: fullTileData.tilesets, // Reference to the same tilesets
			tilewidth: fullTileData.tilewidth,
			tileheight: fullTileData.tileheight,
		};

		return JSON.stringify(chunkJson);
	}

	/**
	 * Retrieves the width and height of a map from its JSON data.
	 * @param {string} tilemapKey - The unique key identifying the map.
	 * @returns {Promise<{ width: number, height: number } | undefined>} The dimensions of the map if found.
	 */
	async getMapDimensions(
		tilemapKey: string,
	): Promise<{ width: number; height: number } | undefined> {
		const mapData = await this.getMap(tilemapKey);
		if (!mapData || !mapData.bounds) {
			Debug.error(`Bounds data for map ${tilemapKey} not found`);
			return undefined;
		}

		const { xMin, xMax, yMin, yMax } = mapData.bounds;
		const width = xMax - xMin;
		const height = yMax - yMin;

		if (width > 0 && height > 0) {
			return { width, height };
		} else {
			Debug.error(`Invalid bounds data for map ${tilemapKey}`);
			return undefined;
		}
	}

	/**
	 * Initializes and chunks the map data into 10x10 pieces.
	 * @param {string} tilemapKey - The unique key identifying the map.
	 * @returns {Promise<void>} Resolves when the map has been chunked and stored.
	 */
	async chunkMap(tilemapKey: string): Promise<void> {
		const mapDimensions = await this.getMapDimensions(tilemapKey);
		if (!mapDimensions) {
			Debug.error(`Failed to retrieve dimensions for map ${tilemapKey}`);
			return;
		}

		const { width, height } = mapDimensions;
		const chunkSize = 10; // Size of each chunk
		const numChunksX = Math.ceil(width / chunkSize);
		const numChunksY = Math.ceil(height / chunkSize);

		for (let chunkX = 0; chunkX < numChunksX; chunkX++) {
			for (let chunkY = 0; chunkY < numChunksY; chunkY++) {
				const jsonData = await this.extractChunkJsonData(
					tilemapKey,
					chunkX,
					chunkY,
					chunkSize,
				);
				await this.addChunk(tilemapKey, chunkX, chunkY, jsonData);
			}
		}
	}
}

// Export the class itself
export { MapDatabase };

// Export a singleton instance
export const mapDatabase = new MapDatabase();
