export const PROTOCOL_VERSION = 16;

export const POS_SCALE = 32;
export const VEL_SCALE = 256;

export const dequantizePos = (q: number): number => q / POS_SCALE;
export const dequantizeVel = (q: number): number => q / VEL_SCALE;
export const quantizePos = (v: number): number => Math.round(v * POS_SCALE);
export const quantizeVel = (v: number): number =>
	Math.max(-32768, Math.min(32767, Math.round(v * VEL_SCALE)));

export const ACTION_ATTACK = 1;
export const ACTION_PICKUP = 2;
export const ACTION_SHOOT = 3;
export const ACTION_LOOT = 4;

export const EPHEMERAL_INVENTORY = 1;
export const EPHEMERAL_COMBAT = 2;
export const EPHEMERAL_PICKUP = 3;
export const EPHEMERAL_ITEM_USED = 5;
export const EPHEMERAL_EQUIPPED = 6;
export const EPHEMERAL_STATS = 7;
export const EPHEMERAL_STATUS = 8;
export const EPHEMERAL_TRADE = 9;
export const EPHEMERAL_SHOP = 10;
export const EPHEMERAL_BLACKJACK = 11;
export const EPHEMERAL_PROJECTILE = 12;
export const EPHEMERAL_FLOOR = 13;
export const EPHEMERAL_ITEM_PLACED = 14;
export const EPHEMERAL_CORPSE = 16;
export const EPHEMERAL_PET_BATTLE_LOG = 18;
export const EPHEMERAL_PET_BATTLE_STATE = 19;

// PetTurn action codes — must match proto.rs PET_ACT_* constants. `arg` is the move
// slot (MOVE) or the reserve index to send out (SWAP).
export const PET_ACT_MOVE = 0;
export const PET_ACT_SWAP = 1;
export const PET_ACT_ITEM = 2;
export const PET_ACT_RUN = 3;

// Pet battle replay event kinds (the `kind` byte on PetBattleWireEvent). Must match
// proto.rs PB_* constants.
export const PB_USED = 0;
export const PB_DAMAGE = 1;
export const PB_MISS = 2;
export const PB_FAINT = 3;
export const PB_SWAP = 4;
export const PB_STATUS = 5;
export const PB_STATUS_DMG = 6;
export const PB_HEAL = 7;
export const PB_STAT = 8;
export const PB_NOPP = 9;
export const PB_PARALYZED = 10;
export const PB_TURN = 11;
export const PB_INFO = 12;

// On a PB_USED event the server packs the move's element index into `value` and the
// move category into `flag` (bits 0-1: 0 physical/1 special/2 status) plus a ranged bit
// (bit 2) — so the client can fire the right elemental projectile for either side.
// ELEMENT_NAMES MUST match simgrid `Element::idx` order.
export const ELEMENT_NAMES = [
	'none',
	'fire',
	'ice',
	'lightning',
	'poison',
	'shadow',
	'holy',
	'arcane',
	'earth',
	'wind',
	'nature',
	'light',
] as const;
export const PB_USED_CATEGORY_MASK = 0b11;
export const PB_USED_RANGED = 0b100;

/** One pet in a battle replay (active battler + reserves). */
export interface PetBattler {
	species_ref: string;
	nickname: string;
	level: number;
	hp: number;
	max_hp: number;
}

/** One flattened battle event. `side` is the affected pet (target for damage); `flag`
 * packs bit0=crit, bits1-2=effectiveness; `hp` is the affected active's remaining HP. */
export interface PetBattleWireEvent {
	kind: number;
	side: number;
	value: number;
	hp: number;
	flag: number;
	text: string;
}

/** A simulated battle replay: both teams + the ordered event stream to animate. */
export interface PetBattleReplay {
	player: PetBattler[];
	enemy: PetBattler[];
	events: PetBattleWireEvent[];
	outcome: string;
}

/** One selectable move on the active pet. `category` 0 physical/1 special/2 status;
 * `accuracy` is a percent (101 = never-miss); `pp`/`max_pp` are the per-move cost. */
export interface PetMoveOption {
	slot: number;
	name: string;
	element: string;
	category: number;
	power: number;
	accuracy: number;
	pp: number;
	max_pp: number;
}

/** A turn-by-turn snapshot of an interactive pet battle: teams, active indices, the
 * player's move menu, the events of the turn just resolved (to animate), the outcome,
 * and whether the server is `awaiting` the player's next action. */
export interface PetBattleState {
	player: PetBattler[];
	enemy: PetBattler[];
	p_active: number;
	e_active: number;
	moves: PetMoveOption[];
	events: PetBattleWireEvent[];
	outcome: string;
	awaiting: boolean;
	can_run: boolean;
}

export const KIND_CAT_PLAYER = 0;
export const KIND_CAT_NPC = 1;
export const KIND_CAT_ITEM = 2;
export const KIND_CAT_ENV = 3;

export type Dir = 'Up' | 'Down' | 'Left' | 'Right';
export type Facing = 'Up' | 'Down' | 'Left' | 'Right';

export interface Tile {
	x: number;
	y: number;
}

export type Input =
	| { Step: { dir: Dir } }
	| {
			Move: {
				seq: number;
				mx: number;
				my: number;
				run: boolean;
				tick: number;
			};
	  }
	| { MoveTo: { tile: Tile } }
	| { Face: { facing: Facing } }
	| { Action: { id: number; target: number | null } }
	| { UseItem: { item_ref: string } }
	| { CastSpell: { spell_ref: string; target: number | null } }
	| { DropItem: { item_ref: string; qty: number } }
	| { MoveItem: { from: number; to: number } }
	| { EquipItem: { item_ref: string } }
	| { PlaceItem: { item_ref: string; tile: Tile; rot: number } }
	| { PickupObject: { tile: Tile } }
	| { Heartbeat: { client_tick: number } }
	| 'Leave'
	| { TradeOffer: { target: number; items: [string, number][] } }
	| 'TradeAccept'
	| 'TradeCancel'
	| { BuyItem: { npc: number; item_ref: string; qty: number } }
	| { SellItem: { npc: number; item_ref: string; qty: number } }
	| { JoinTable: { table_ref: string } }
	| 'LeaveTable'
	| { PlaceBet: { amount: number } }
	| { BjAction: { kind: BjActionKind } }
	| { Insure: { amount: number } }
	| { Fell: { tile: Tile } }
	| { EnterShip: { ship: number } }
	| 'ExitShip'
	| { OpenCorpse: { corpse: number } }
	| { TakeFromCorpse: { corpse: number; slot: number } }
	| 'LaunchSpace'
	| 'ReturnSpace'
	| 'SimPetBattle'
	| { PetTurn: { action: number; arg: number } };

export type BjActionKind = 'Hit' | 'Stand' | 'Double' | 'Split' | 'Surrender';

export interface JoinMatch {
	protocol: number;
	jwt: string;
	kbve_username: string;
}

export interface ClientFrame {
	client_tick: number;
	inputs: Input[];
}

export type ClientMessage = { JoinMatch: JoinMatch } | { Frame: ClientFrame };

export interface PlayerView {
	slot: number;
	kbve_username: string;
	connected: boolean;
}

export type StatusKind = 'Poison' | 'Regen' | 'Haste' | 'Burn';

export interface StatusView {
	kind: StatusKind;
	remaining: number;
}

export interface EntityDelta {
	eid: number;
	kind: number;
	owner: number;
	tile: Tile;
	facing: Facing;
	sub: number;
	qx?: number;
	qy?: number;
	qvx?: number;
	qvy?: number;
	input_ack?: number;
	hp: number;
	max_hp: number;
	destroyed: boolean;
	/** Dungeon floor (z-axis). Absent/0 = ground floor (single-floor games). */
	z?: number;
	effects?: StatusView[];
	/** For a PLAYER: the eid of the ship it is piloting, or 0 on foot. Clients hide
	 * the body + float the nameplate over that ship so others see who is flying it. */
	piloting?: number;
	/** Nameplate pools — appended after `piloting` (positional postcard wire). */
	mp?: number;
	max_mp?: number;
	energy?: number;
	max_energy?: number;
	stamina?: number;
	max_stamina?: number;
}

export interface Snapshot {
	tick: number;
	server_time_ms: number;
	input_ack: number;
	players: PlayerView[];
	entities: EntityDelta[];
	keyframe: boolean;
}

export interface KindEntry {
	kind: number;
	ref: string;
	cat: number;
}

export interface Welcome {
	protocol: number;
	your_slot: number;
	seed: number;
	registry: KindEntry[];
}

export interface Ephemeral {
	kind: number;
	to: number;
	payload: number[];
}

export interface InventoryItem {
	/** ULID instance identity for the stack (stable across moves; mint timestamp
	 * embedded). Present on a real inventory stack; omitted for ref+qty display lines
	 * that aren't instances (corpse-loot rows, trade-offer lines). */
	id?: string;
	ref: string;
	count: number;
}

export interface InventorySync {
	items: InventoryItem[];
}

export interface TradeSide {
	items: InventoryItem[];
	accepted: boolean;
}

/** Trade window state for both participants; a closed trade has empty sides. */
export interface TradeStateView {
	status: string;
	with: number;
	you: TradeSide;
	them: TradeSide;
}

/** Result of a spell cast; `reason` set only on failure. */
export interface SpellResult {
	caster: number;
	target: number | null;
	spell_ref: string;
	effect: string;
	amount: number;
	ok: boolean;
	reason: string;
}

export interface ShopResult {
	action: 'buy' | 'sell';
	item_ref: string;
	qty: number;
	ok: boolean;
	reason: string;
	balance: number;
}

export interface CombatEvent {
	attacker: number;
	target: number;
	target_ref: string | null;
	dmg: number;
	died: boolean;
	crit?: boolean;
}

export interface ProjectileEvent {
	attacker: number;
	from: { x: number; y: number };
	to: { x: number; y: number };
	kind: string;
	hit: boolean;
}

/** The local player changed dungeon floor (took a stair). The client re-streams
 * the destination floor and snaps the body to `tile` on floor `z`. */
export interface FloorChangeEvent {
	z: number;
	tile: { x: number; y: number };
}

export interface PickupEvent {
	item_ref: string;
	count: number;
}

/** A corpse's current loot, pushed to the player who has it open (and re-pushed
 * after each take). `items` are [ref, count] in slot order; take a slot by index. */
export interface CorpseContents {
	corpse: number;
	items: [string, number][];
}

export interface ItemUsedEvent {
	item_ref: string;
	heal: number;
}

export interface ItemPlacedEvent {
	item_ref: string;
	tile: { x: number; y: number };
	ok: boolean;
	reason?: string;
}

export interface EquippedEvent {
	item_ref: string | null;
	slot: 'weapon' | 'armor';
	attack: number;
	defense: number;
}

export interface StatsEvent {
	level: number;
	xp: number;
	xp_next: number;
	max_hp: number;
	attack: number;
	kills: number;
	mp: number;
	max_mp: number;
}

export interface StatusEvent {
	kind: number;
	magnitude: number;
	remaining: number;
}

export interface BlackjackHandView {
	cards: number[];
	bet: number;
	value: number;
	soft: boolean;
	doubled: boolean;
	surrendered: boolean;
	done: boolean;
	outcome: string | null;
}

export interface BlackjackSeatView {
	slot: number;
	username: string;
	bet: number;
	insurance: number;
	/** One entry per playable hand; more than one after a split. */
	hands: BlackjackHandView[];
	/** Player is offline; the seat is held open for a reconnect. */
	disconnected?: boolean;
}

export interface BlackjackStateView {
	table_ref: string;
	phase: string;
	seats: BlackjackSeatView[];
	dealer_hand: number[];
	dealer_hidden: boolean;
	active_slot: number | null;
	/** Index of the active hand within the active seat (for split turns). */
	active_hand: number | null;
	your_balance: number;
	deadline_ms: number | null;
	/** Provable fairness: SHA-256 of the round seed, published before the deal. */
	commitment?: string;
	/** The round seed (decimal string), revealed only once the round settles. */
	seed?: string | null;
}

export type CardSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardRank =
	| 'A'
	| '2'
	| '3'
	| '4'
	| '5'
	| '6'
	| '7'
	| '8'
	| '9'
	| '10'
	| 'J'
	| 'Q'
	| 'K';

export interface DecodedCard {
	suit: CardSuit;
	rank: CardRank;
	points: number;
	red: boolean;
}

const CARD_SUITS: CardSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const CARD_RANKS: CardRank[] = [
	'A',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'J',
	'Q',
	'K',
];
const CARD_RANK_POINTS = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];

/** Decode a server card byte (6-bit: `suit << 4 | rank`) for rendering. */
export function decodeCard(byte: number): DecodedCard {
	const rankIndex = byte & 0b1111;
	const suitIndex = (byte >> 4) & 0b11;
	return {
		suit: CARD_SUITS[suitIndex],
		rank: CARD_RANKS[rankIndex],
		points: CARD_RANK_POINTS[rankIndex],
		red: suitIndex === 1 || suitIndex === 2,
	};
}

// ---- Provable fairness ----
// Mirror of the server's splitmix64 RNG + Fisher–Yates shuffle (blackjack.rs), so a
// client holding the revealed round seed can replay the exact shoe and confirm it
// matches the dealt cards. u64 maths are done in BigInt.

const U64_MASK = (1n << 64n) - 1n;

function bjMix(z: bigint): bigint {
	z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
	z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
	return z ^ (z >> 31n);
}

/** The full 4-deck shoe order a round seed produces (top of shoe is the last byte). */
export function bjShoeOrder(seed: string): number[] {
	const shoe: number[] = [];
	for (let deck = 0; deck < 4; deck++) {
		for (let suit = 0; suit < 4; suit++) {
			for (let rank = 0; rank < 13; rank++) shoe.push((suit << 4) | rank);
		}
	}
	let state = BigInt(seed) & U64_MASK;
	for (let i = shoe.length - 1; i > 0; i--) {
		state = (state + 0x9e3779b97f4a7c15n) & U64_MASK;
		const j = Number(bjMix(state) % BigInt(i + 1));
		const tmp = shoe[i];
		shoe[i] = shoe[j];
		shoe[j] = tmp;
	}
	return shoe;
}

/** Recompute SHA-256 of the revealed seed and check it equals the committed hash. */
export async function verifyBlackjackCommitment(
	seed: string,
	commitment: string,
): Promise<boolean> {
	let v = BigInt(seed) & U64_MASK;
	const bytes = new Uint8Array(8);
	for (let i = 0; i < 8; i++) {
		bytes[i] = Number(v & 0xffn);
		v >>= 8n;
	}
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	const hex = Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return hex === commitment;
}

export type ServerEvent =
	| { Welcome: Welcome }
	| { Snapshot: Snapshot }
	| { Ephemeral: Ephemeral }
	| { Reject: { reason: string } };

export const OWNER_NONE = 0xffff;

export function decodeEphemeralPayload<T>(payload: number[]): T | null {
	try {
		return JSON.parse(
			new TextDecoder().decode(Uint8Array.from(payload)),
		) as T;
	} catch {
		return null;
	}
}

export function joinFrame(jwt: string, kbveUsername: string): ClientMessage {
	return {
		JoinMatch: {
			protocol: PROTOCOL_VERSION,
			jwt,
			kbve_username: kbveUsername,
		},
	};
}

export function inputFrame(clientTick: number, inputs: Input[]): ClientMessage {
	return { Frame: { client_tick: clientTick, inputs } };
}
