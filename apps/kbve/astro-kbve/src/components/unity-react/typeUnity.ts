/**
 * Unity WebGL Types
 * Defines all TypeScript types for Unity WebGL integration
 * Uses react-unity-webgl library types where applicable
 */

import type { UnityConfig as ReactUnityWebGLConfig } from 'react-unity-webgl';

/**
 * Re-export Unity Configuration from react-unity-webgl
 */
export type UnityConfig = ReactUnityWebGLConfig;

/**
 * Unity Instance interface (extended from react-unity-webgl)
 */
export interface UnityInstance {
	/**
	 * Send a message to Unity
	 * @param objectName - The name of the GameObject in Unity
	 * @param methodName - The method name to call
	 * @param value - The value to pass (optional)
	 */
	sendMessage(
		objectName: string,
		methodName: string,
		value?: string | number,
	): void;

	/**
	 * Request fullscreen mode
	 */
	requestFullscreen(): void;

	/**
	 * Take a screenshot
	 */
	takeScreenshot(dataType?: string, quality?: number): string | null;

	/**
	 * Request pointer lock
	 */
	requestPointerLock(): void;

	/**
	 * Unload the Unity instance
	 */
	unload(): Promise<void>;
}

/**
 * Unity Loading Progress callback
 */
export interface UnityProgress {
	/**
	 * Progress value between 0 and 1
	 */
	progress: number;

	/**
	 * Optional message about the current loading state
	 */
	message?: string;
}

/**
 * Unity Event types that can be sent from Unity to React
 * These match the MessageTypes.cs constants in Unity
 */
export enum UnityEventType {
	// Legacy events (kept for backwards compatibility)
	GAME_LOADED = 'gameLoaded',
	GAME_READY = 'gameReady',
	PLAYER_SPAWNED = 'playerSpawned',
	GAME_OVER = 'gameOver',
	SCORE_UPDATED = 'scoreUpdated',
	LEVEL_COMPLETED = 'levelCompleted',
	ERROR = 'error',
	CUSTOM = 'custom',

	// New standardized events (match Unity MessageTypes.cs)
	// Bridge initialization
	BRIDGE_READY = 'BridgeReady',

	// Game lifecycle
	GAME_PAUSED = 'GamePaused',
	GAME_RESUMED = 'GameResumed',
	LEVEL_STARTED = 'LevelStarted',

	// Player events
	PLAYER_DIED = 'PlayerDied',
	PLAYER_RESPAWNED = 'PlayerRespawned',
	PLAYER_MOVED = 'PlayerMoved',
	PLAYER_STATS_UPDATED = 'PlayerStatsUpdated',
	PLAYER_INVENTORY_UPDATED = 'PlayerInventoryUpdated',

	// Entity events
	ENTITY_SPAWNED = 'EntitySpawned',
	ENTITY_DESTROYED = 'EntityDestroyed',
	ENTITY_UPDATED = 'EntityUpdated',

	// Terrain events
	CHUNK_LOADED = 'ChunkLoaded',
	CHUNK_UNLOADED = 'ChunkUnloaded',
	TERRAIN_GENERATED = 'TerrainGenerated',

	// Progress events
	ACHIEVEMENT_UNLOCKED = 'AchievementUnlocked',
	PROGRESS_UPDATED = 'ProgressUpdated',

	// Data persistence
	DATA_SAVE_REQUEST = 'DataSaveRequest',
	DATA_LOAD_REQUEST = 'DataLoadRequest',
	DATA_SAVED = 'DataSaved',
	DATA_LOADED = 'DataLoaded',

	// Errors
	WARNING = 'Warning',
}

/**
 * Unity Event payload structure
 */
export interface UnityEvent<T = unknown> {
	/**
	 * Type of the event
	 */
	type: UnityEventType | string;

	/**
	 * Event data payload
	 */
	data?: T;

	/**
	 * Timestamp of the event
	 */
	timestamp?: number;
}

/**
 * Vector3 data structure (matches Unity Vector3Data)
 */
export interface Vector3Data {
	x: number;
	y: number;
	z: number;
}

/**
 * Quaternion data structure (matches Unity QuaternionData)
 */
export interface QuaternionData {
	x: number;
	y: number;
	z: number;
	w: number;
}

/**
 * Transform data structure (matches Unity TransformData)
 */
export interface TransformData {
	position: Vector3Data;
	rotation: QuaternionData;
	scale: Vector3Data;
}

/**
 * Player data structure (enhanced to match Unity PlayerData)
 */
export interface PlayerData {
	id?: string; // Optional for backwards compatibility
	playerId?: string; // Unity uses playerId
	username?: string; // Legacy field
	playerName?: string; // Unity uses playerName
	level: number;
	score?: number; // Legacy field
	experience?: number; // Unity uses experience
	health?: number;
	maxHealth?: number;
	position?: Vector3Data;
	inventory?: string[];
	stats?: Record<string, number>;
}

/**
 * Game state structure
 */
export interface GameState {
	isPlaying: boolean;
	isPaused: boolean;
	currentLevel: number;
	score: number;
	timeElapsed: number;
}

/**
 * Supabase communication payload
 */
export interface SupabasePayload {
	action: 'save' | 'load' | 'update' | 'delete';
	table: string;
	data: Record<string, unknown>;
	userId?: string;
}

/**
 * Unity Service Event Handlers
 */
export interface UnityServiceEventHandlers {
	onGameLoaded?: () => void;
	onGameReady?: () => void;
	onProgress?: (progress: UnityProgress) => void;
	onError?: (error: Error) => void;
	onUnityEvent?: (event: UnityEvent) => void;
}

/**
 * Unity Container Props
 */
export interface UnityContainerProps {
	/**
	 * Unity build configuration
	 */
	config: UnityConfig;

	/**
	 * CSS class name for the container
	 */
	className?: string;

	/**
	 * Canvas ID
	 */
	canvasId?: string;

	/**
	 * Event handlers
	 */
	eventHandlers?: UnityServiceEventHandlers;

	/**
	 * Whether to start in fullscreen mode
	 */
	startFullscreen?: boolean;

	/**
	 * Loading component to show while Unity loads
	 */
	loadingComponent?: React.ReactNode;
}

/**
 * Message from Unity to Web
 */
export interface UnityToWebMessage {
	messageType: string;
	payload: unknown;
}

/**
 * Message from Web to Unity
 */
export interface WebToUnityMessage {
	gameObject: string;
	method: string;
	parameter?: string | number;
}

/**
 * Session data structure (matches Unity SessionData)
 */
export interface SessionData {
	userId: string;
	email: string;
	username?: string;
	displayName?: string;
	avatarUrl?: string;
}

/**
 * Entity data structure (matches Unity EntityData)
 */
export interface EntityData {
	entityId: string;
	entityType: string;
	position: Vector3Data;
	rotation: QuaternionData;
	health: number;
	isActive: boolean;
	state?: string;
}

/**
 * Chunk data structure (matches Unity ChunkData)
 */
export interface ChunkData {
	chunkX: number;
	chunkZ: number;
	isLoaded: boolean;
	heightMap?: number[];
	biomeIds?: number[];
	vertexCount?: number;
	generationTime?: number;
}

/**
 * Mesh data packet (matches Unity MeshDataPacket)
 */
export interface MeshDataPacket {
	name: string;
	vertexCount: number;
	triangleCount: number;
}

/**
 * Terrain chunk metadata (matches Unity TerrainChunkMetadata)
 */
export interface TerrainChunkMetadata {
	chunkX: number;
	chunkZ: number;
	width: number;
	height: number;
}

/**
 * Texture metadata (matches Unity TextureMetadata)
 */
export interface TextureMetadata {
	name: string;
	width: number;
	height: number;
	format: string;
}

/**
 * Game state event (matches Unity GameStateEvent)
 */
export interface GameStateEvent {
	state: string;
	reason?: string;
	gameTime: number;
}

/**
 * Level event (matches Unity LevelEvent)
 */
export interface LevelEvent {
	levelNumber: number;
	levelName: string;
	completed: boolean;
	completionTime: number;
	score: number;
}

/**
 * Player spawn event (matches Unity PlayerSpawnEvent)
 */
export interface PlayerSpawnEvent {
	playerId: string;
	playerName: string;
	position: Vector3Data;
	health: number;
	maxHealth: number;
}

/**
 * Player stats event (matches Unity PlayerStatsEvent)
 */
export interface PlayerStatsEvent {
	playerId: string;
	health: number;
	maxHealth: number;
	level: number;
	experience: number;
	customStats?: number[];
}

/**
 * Entity event (matches Unity EntityEvent)
 */
export interface EntityEvent {
	entityId: string;
	entityType: string;
	position: Vector3Data;
	rotation: QuaternionData;
	health: number;
	isActive: boolean;
	state: string;
}

/**
 * Chunk event (matches Unity ChunkEvent)
 */
export interface ChunkEvent {
	chunkX: number;
	chunkZ: number;
	isLoaded: boolean;
	vertexCount?: number;
	generationTime?: number;
}

/**
 * Score event (matches Unity ScoreEvent)
 */
export interface ScoreEvent {
	score: number;
	delta: number;
	reason: string;
	playerId: string;
}

/**
 * Achievement event (matches Unity AchievementEvent)
 */
export interface AchievementEvent {
	achievementId: string;
	achievementName: string;
	description: string;
	points: number;
	playerId: string;
}

/**
 * Error event (matches Unity ErrorEvent)
 */
export interface ErrorEvent {
	errorType: string;
	message: string;
	stackTrace?: string;
	source: string;
	timestamp: string;
}

/**
 * Data result (matches Unity DataResult)
 */
export interface DataResult {
	success: boolean;
	table: string;
	message?: string;
	error?: string;
	timestamp: string;
}

/**
 * Command message (matches Unity CommandMessage)
 */
export interface CommandMessage {
	command: string;
	args: string[];
	userId: string;
}

/**
 * Unity array data event (from WebGLBridge.jslib)
 */
export interface UnityArrayDataEvent {
	type: string;
	dataType: 'Float32Array' | 'Int32Array' | 'Uint8Array' | 'Float64Array';
	data: Float32Array | Int32Array | Uint8Array | Float64Array;
	length: number;
	timestamp: string;
}

/**
 * Unity message event (from WebGLBridge.jslib)
 */
export interface UnityMessageEvent {
	type: string;
	data: any;
	timestamp: string;
}

/**
 * Unity error event (from WebGLBridge.jslib)
 */
export interface UnityErrorEvent {
	message: string;
	timestamp: string;
}
