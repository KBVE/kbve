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

// Tile prediction — BFS pathing that mirrors the server grid
export { findTilePath } from './lib/tile/path';
export type { TileXY } from './lib/tile/path';

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
	EPHEMERAL_PET_LEARN,
	PET_LEARN_OFFER,
	PET_LEARN_LEARNED,
	PET_LEARN_DECLINED,
	PET_LEARN_EXPIRED,
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
	GENE_STATS,
	IV_MAX,
	IV_TOTAL_MAX,
	NATURE_STATS,
	NATURE_COUNT,
	FRIENDSHIP_DEVOTED,
	natureEffect,
	genderGlyph,
	PB_USED_CATEGORY_MASK,
	PB_USED_RANGED,
	PET_ACT_MOVE,
	PET_ACT_SWAP,
	PET_ACT_ITEM,
	PET_ACT_RUN,
	PET_ACT_CATCH,
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
	PetMoveView,
	PetView,
	PetRosterSync,
	PetNotice,
	PetLearnOffer,
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
