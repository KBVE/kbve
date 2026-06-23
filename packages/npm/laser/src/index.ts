// Core
export { LaserEventBus, laserEvents } from './lib/core/events';
export type {
	LaserGameConfig,
	GameStatus,
	LaserEventMap,
	Point2D,
	Bounds2D,
	Bounds,
	Range,
	GridDirection,
	CharacterEventData,
	NotificationEventData,
} from './lib/core/types';

// Spatial
export { Quadtree } from './lib/spatial/quadtree';

// Phaser
export { PhaserGame } from './lib/phaser/PhaserGame';
export type { PhaserGameProps, PhaserGameRef } from './lib/phaser/PhaserGame';
export { PhaserContext, usePhaserGame } from './lib/phaser/use-phaser';
export { usePhaserEvent } from './lib/phaser/use-phaser-event';
export { PlayerController } from './lib/phaser/player-controller';
export { VirtualJoystick } from './lib/phaser/virtual-joystick';
export type { VirtualJoystickConfig } from './lib/phaser/virtual-joystick';
export {
	flashEntity,
	floatingText,
	drawHealthBar,
	attachCameraZoom,
} from './lib/phaser/entity-fx';
export type { CameraZoomOptions } from './lib/phaser/entity-fx';

// Tile prediction — BFS pathing that mirrors the server grid
export { findTilePath } from './lib/tile/path';
export type { TileXY } from './lib/tile/path';
export {
	getBirdNum,
	isBird,
	createBirdSprites,
	createShadowSprites,
	createBirdAnimation,
} from './lib/phaser/monsters/bird';

// R3F
export { Stage } from './lib/r3f/components/Stage';
export type { StageProps } from './lib/r3f/components/Stage';
export { useGameLoop } from './lib/r3f/hooks/use-game-loop';

// WebGL context-loss guard (framework-agnostic; shared across WebGL games)
export {
	isWebGLAvailable,
	installWebGLContextGuard,
	reportWebGLEvent,
} from './lib/webgl/context-guard';
export type {
	WebGLEventKind,
	ContextGuardHandlers,
} from './lib/webgl/context-guard';

// ECS (bitecs) — full re-export of bitecs core API
export * from './lib/ecs/bitecs';

// ECS helpers (spatial queries, side-map for managed refs)
export {
	SideMap,
	nearestInRange,
	queryInRange,
	type PositionLike,
} from './lib/ecs/helpers';

// Physics (Rapier)
export { RAPIER, createRapierPhysics } from './lib/physics/rapier';

// Determinism — RNG primitives mirrored byte-for-byte by simgrid rng.rs
export { Domain, mix32, mulberry32, stream, rollPct } from './lib/determ';

// Combat — attack geometry mirrored byte-for-byte by simgrid combat.rs
export {
	AttackShape,
	MELEE_RANGE,
	BOW_RANGE,
	inRangeAdjacent,
	lineCast,
	aoeTiles,
} from './lib/combat';

// Net — shared reconnecting socket + connection state machine
export { ReconnectingSocket, defaultCloseReason } from './lib/net/connection';
export type {
	ConnectionStatus,
	ConnectionState,
	ReconnectingSocketOptions,
	ReconnectingSocketHandlers,
} from './lib/net/connection';

// Net — WS client speaking the simgrid JSON wire
export { GameClient } from './lib/net/game-client';
export { RealmChatClient } from './lib/net/realm-chat-client';
export type {
	RealmChatOptions,
	RealmChatMessage,
	RealmChatEventMap,
	RealmChatStatus,
	RealmChatState,
} from './lib/net/realm-chat-client';
export type {
	GameClientOptions,
	GameClientEventMap,
} from './lib/net/game-client';
export {
	PROTOCOL_VERSION,
	OWNER_NONE,
	ACTION_ATTACK,
	ACTION_PICKUP,
	ACTION_SHOOT,
	EPHEMERAL_INVENTORY,
	EPHEMERAL_COMBAT,
	EPHEMERAL_PROJECTILE,
	EPHEMERAL_FLOOR,
	EPHEMERAL_PICKUP,
	EPHEMERAL_ITEM_USED,
	EPHEMERAL_EQUIPPED,
	EPHEMERAL_STATS,
	EPHEMERAL_STATUS,
	EPHEMERAL_TRADE,
	EPHEMERAL_SHOP,
	EPHEMERAL_BLACKJACK,
	KIND_CAT_PLAYER,
	KIND_CAT_NPC,
	KIND_CAT_ITEM,
	joinFrame,
	inputFrame,
	decodeEphemeralPayload,
	decodeCard,
	bjShoeOrder,
	verifyBlackjackCommitment,
} from './lib/net/protocol';
export type {
	Dir,
	Facing,
	Tile,
	Input,
	ClientMessage,
	ServerEvent,
	Snapshot,
	EntityDelta,
	StatusKind,
	StatusView,
	PlayerView,
	Welcome,
	JoinMatch,
	ClientFrame,
	KindEntry,
	Ephemeral,
	InventoryItem,
	InventorySync,
	ShopResult,
	CombatEvent,
	ProjectileEvent,
	FloorChangeEvent,
	PickupEvent,
	ItemUsedEvent,
	ItemPlacedEvent,
	EquippedEvent,
	StatsEvent,
	StatusEvent,
	BjActionKind,
	BlackjackHandView,
	BlackjackSeatView,
	BlackjackStateView,
	CardSuit,
	CardRank,
	DecodedCard,
} from './lib/net/protocol';

// Game auth — session -> { jwt, username, wsUrl } glue shared by KBVE Phaser
// games. The Supabase client is injected (laser stays dep-free).
export {
	usernameFromToken,
	createNetConfig,
	makeWsResolver,
	createChatClient,
} from './lib/auth/game-auth';
export type {
	GameSession,
	SessionSource,
	GameNetConfig,
	NetConfigOptions,
	GameNetConfigStore,
	ChatConfig,
} from './lib/auth/game-auth';

// i18n — framework-agnostic translation store + React provider/hook
export {
	I18nStore,
	laserI18n,
	I18nProvider,
	useTranslation,
	type LocaleMessages,
	type I18nVars,
	type I18nOptions,
	type UseTranslation,
} from './lib/i18n';
