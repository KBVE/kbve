/**
 * Unity React Integration - Barrel Exports
 * Centralized exports for Unity WebGL integration
 */

// Export main React component
export { ReactUnity, type ReactUnityProps } from './ReactUnity';

// Export Unity Service and helper functions
export {
	unityService,
	typedArrayToBase64,
	base64ToUint8Array,
	base64ToFloat32Array,
	base64ToInt32Array,
} from './unityService';

// Export all types
export type {
	// Core types
	UnityInstance,
	UnityConfig,
	UnityProgress,
	UnityEvent,
	UnityServiceEventHandlers,
	UnityContainerProps,
	PlayerData,
	GameState,
	SupabasePayload,
	WebToUnityMessage,
	UnityToWebMessage,

	// Geometry types
	Vector3Data,
	QuaternionData,
	TransformData,

	// Session and entity types
	SessionData,
	EntityData,
	ChunkData,

	// Mesh and terrain types
	MeshDataPacket,
	TerrainChunkMetadata,
	TextureMetadata,

	// Event types
	GameStateEvent,
	LevelEvent,
	PlayerSpawnEvent,
	PlayerStatsEvent,
	EntityEvent,
	ChunkEvent,
	ScoreEvent,
	AchievementEvent,
	ErrorEvent,
	DataResult,
	CommandMessage,

	// Bridge types
	UnityArrayDataEvent,
	UnityMessageEvent,
	UnityErrorEvent,
} from './typeUnity';

// Export enums
export { UnityEventType } from './typeUnity';
