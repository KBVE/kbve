// Core
export { LaserEventBus, laserEvents } from './lib/core/events';
export type { LaserEventRecord } from './lib/core/events';
export {
	invariant,
	resetInvariants,
	setInvariantThrottle,
	INVARIANT_EVENT,
} from './lib/core/invariant';
export type { InvariantViolation } from './lib/core/invariant';
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
	drawHealthBarCached,
	attachCameraZoom,
} from './lib/phaser/entity-fx';
export type { CameraZoomOptions } from './lib/phaser/entity-fx';
export {
	createGpuSpriteLayer,
	populateGpuSpriteLayer,
} from './lib/phaser/gpu-sprite-layer';
export type {
	GpuSpriteLayerOptions,
	GpuSpriteLayerHandle,
} from './lib/phaser/gpu-sprite-layer';
export {
	createDustMoteLayer,
	createWorldDustLayer,
	dustMemberAt,
} from './lib/phaser/ambient-dust';
export type {
	DustMoteOptions,
	WorldDustHandle,
	WorldDustOptions,
} from './lib/phaser/ambient-dust';
export { GameObjectPool } from './lib/phaser/object-pool';
export { setupKeyboardMap } from './lib/phaser/keyboard-map';
export type { KeyboardMap } from './lib/phaser/keyboard-map';
export {
	createArrowPool,
	animateArrowProjectile,
} from './lib/phaser/arrow-projectile';
export type {
	ArrowPool,
	ArrowPoolOptions,
	ArrowShot,
} from './lib/phaser/arrow-projectile';

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

// WebGL — Parallax / Silhouette Occlusion Mapping (POM / SPOM) primitives
export {
	createPomUniforms,
	toThreeUniforms,
	POM_DEFAULTS,
	POM_MAX_STEPS,
	POM_VARYINGS,
	DERIVE_TANGENT,
	POM_MARCH,
	SPOM_SILHOUETTE,
	POM_SELF_SHADOW,
	HEIGHT_HELPERS,
	POM_SOURCE_BRICK,
	POM_SOURCE_LUMA,
	POM_SOURCE_MAP,
	POM_WGSL_STUB,
} from './lib/webgl/pom';
export type {
	PomUniformValues,
	PomConfig,
	PomMaterialType,
} from './lib/webgl/pom';

// ECS (bitecs) — full re-export of bitecs core API
export * from './lib/ecs/bitecs';

// ECS helpers (spatial queries, side-map for managed refs)
export {
	SideMap,
	nearestInRange,
	queryInRange,
	packTile,
	type PositionLike,
} from './lib/ecs/helpers';

// ECS shared components + managed entity store (canonical home; game clients
// import these instead of redefining a local world wrapper)
export * from './lib/ecs/components';
export {
	EntityStore,
	Cat,
	type EntityCat,
	type SpawnData,
	type UpdateData,
} from './lib/ecs/store';

// Physics (Rapier)
export { RAPIER, createRapierPhysics } from './lib/physics/rapier';

// Determinism — RNG primitives mirrored byte-for-byte by simgrid rng.rs
export { Domain, mix32, mulberry32, stream, rollPct } from './lib/determ';
export {
	heightAt,
	makeHeightSampler,
	seedFromWorld,
	HEIGHT_AMPLITUDE,
	type HeightSampler,
} from './lib/determ/heightfield';

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
	ACTION_LOOT,
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
	EPHEMERAL_DUEL_PROMPT,
	DUEL_PROMPT_OFFER,
	DUEL_PROMPT_DECLINED,
	DUEL_PROMPT_EXPIRED,
	DUEL_PROMPT_ACCEPTED,
	DUEL_PROMPT_SENT,
	PB_USED,
	PB_DAMAGE,
	PB_MISS,
	PB_FAINT,
	PB_SWAP,
	PB_STATUS,
	PB_STATUS_DMG,
	PB_HEAL,
	PB_STAT,
	PB_NOPP,
	PB_PARALYZED,
	PB_TURN,
	PB_INFO,
	ELEMENT_NAMES,
	PB_USED_CATEGORY_MASK,
	PB_USED_RANGED,
	PET_ACT_MOVE,
	PET_ACT_SWAP,
	PET_ACT_ITEM,
	PET_ACT_RUN,
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
	CorpseContents,
	PetBattler,
	PetBattleWireEvent,
	PetBattleReplay,
	PetMoveOption,
	PetBattleState,
	DuelPrompt,
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

// Embed — Discord Activity / embedded-SDK helpers shared across game clients:
// an external-link opener registry (sandbox-safe outbound links) + the boot-time
// hardware-acceleration prompt.
export {
	setExternalOpener,
	getExternalOpener,
	openExternal,
	onExternalClick,
} from './lib/embed/external';
export type { ExternalOpener } from './lib/embed/external';
export {
	installDiscordExternal,
	encourageHardwareAcceleration,
} from './lib/embed/discord-external';
export type { DiscordExternalSdk } from './lib/embed/discord-external';

// Ads — framework-agnostic cross-promo model + boot-screen card + rotation pool
export { AdCard } from './lib/promo/PromoCard';
export type { AdCardProps } from './lib/promo/PromoCard';
export { pickAd, AdRegistry, laserAds } from './lib/promo/registry';
export type { AdCreative } from './lib/promo/types';

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
