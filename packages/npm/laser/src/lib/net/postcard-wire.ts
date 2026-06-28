// Protocol <-> postcard mapping. Discriminants + field order MUST match proto.rs
// exactly (postcard is positional). NB: the JSON `Input` union here lists UseItem
// before CastSpell, but Rust declares CastSpell=5, UseItem=6 — the maps below use
// the RUST order, which is authoritative for the wire.
import type {
	BjActionKind,
	ClientMessage,
	Dir,
	BlackjackHandView,
	BlackjackSeatView,
	BlackjackStateView,
	CombatEvent,
	CorpseContents,
	EntityDelta,
	EquippedEvent,
	Facing,
	FloorChangeEvent,
	Input,
	InventorySync,
	ItemPlacedEvent,
	ItemUsedEvent,
	KindEntry,
	PetBattleLog,
	PickupEvent,
	PlayerView,
	ProjectileEvent,
	ServerEvent,
	ShopResult,
	Snapshot,
	StatsEvent,
	StatusEvent,
	SpellResult,
	StatusKind,
	StatusView,
	Tile,
	TradeSide,
	TradeStateView,
} from './protocol';
import {
	PostcardReader,
	PostcardWriter,
	cobsDecode,
	cobsEncode,
} from './postcard';

const DIR: Record<Dir, number> = { Up: 0, Down: 1, Left: 2, Right: 3 };
const FACING: Record<Facing, number> = { Down: 0, Up: 1, Left: 2, Right: 3 };
const BJ: Record<BjActionKind, number> = {
	Hit: 0,
	Stand: 1,
	Double: 2,
	Split: 3,
	Surrender: 4,
};

function writeTile(w: PostcardWriter, t: Tile): void {
	w.i32(t.x);
	w.i32(t.y);
}

/** Option<EntityId> — tag then the u32 newtype when present. */
function writeOptEid(w: PostcardWriter, eid: number | null): void {
	if (eid === null || eid === undefined) {
		w.option(false);
	} else {
		w.option(true);
		w.u32(eid);
	}
}

function writeInput(w: PostcardWriter, inp: Input): void {
	if (typeof inp === 'string') {
		switch (inp) {
			case 'Leave':
				return w.variant(13);
			case 'TradeAccept':
				return w.variant(15);
			case 'TradeCancel':
				return w.variant(16);
			case 'LeaveTable':
				return w.variant(20);
			case 'ExitShip':
				return w.variant(26);
			case 'LaunchSpace':
				return w.variant(29);
			case 'ReturnSpace':
				return w.variant(30);
			case 'SimPetBattle':
				return w.variant(31);
		}
		return;
	}
	if ('Step' in inp) {
		w.variant(0);
		w.variant(DIR[inp.Step.dir]);
	} else if ('Move' in inp) {
		const m = inp.Move;
		w.variant(1);
		w.u32(m.seq);
		w.i8(m.mx);
		w.i8(m.my);
		w.bool(m.run);
		w.u32(m.tick);
	} else if ('MoveTo' in inp) {
		w.variant(2);
		writeTile(w, inp.MoveTo.tile);
	} else if ('Face' in inp) {
		w.variant(3);
		w.variant(FACING[inp.Face.facing]);
	} else if ('Action' in inp) {
		w.variant(4);
		w.u16(inp.Action.id);
		writeOptEid(w, inp.Action.target);
	} else if ('CastSpell' in inp) {
		w.variant(5);
		w.string(inp.CastSpell.spell_ref);
		writeOptEid(w, inp.CastSpell.target);
	} else if ('UseItem' in inp) {
		w.variant(6);
		w.string(inp.UseItem.item_ref);
	} else if ('DropItem' in inp) {
		w.variant(7);
		w.string(inp.DropItem.item_ref);
		w.u32(inp.DropItem.qty);
	} else if ('MoveItem' in inp) {
		w.variant(8);
		w.u32(inp.MoveItem.from);
		w.u32(inp.MoveItem.to);
	} else if ('EquipItem' in inp) {
		w.variant(9);
		w.string(inp.EquipItem.item_ref);
	} else if ('PlaceItem' in inp) {
		w.variant(10);
		w.string(inp.PlaceItem.item_ref);
		writeTile(w, inp.PlaceItem.tile);
		w.u8(inp.PlaceItem.rot & 0x03);
	} else if ('PickupObject' in inp) {
		w.variant(11);
		writeTile(w, inp.PickupObject.tile);
	} else if ('Heartbeat' in inp) {
		w.variant(12);
		w.u32(inp.Heartbeat.client_tick);
	} else if ('TradeOffer' in inp) {
		w.variant(14);
		w.u32(inp.TradeOffer.target);
		w.seqLen(inp.TradeOffer.items.length);
		for (const [ref, qty] of inp.TradeOffer.items) {
			w.string(ref);
			w.u32(qty);
		}
	} else if ('BuyItem' in inp) {
		w.variant(17);
		w.u32(inp.BuyItem.npc);
		w.string(inp.BuyItem.item_ref);
		w.u32(inp.BuyItem.qty);
	} else if ('SellItem' in inp) {
		w.variant(18);
		w.u32(inp.SellItem.npc);
		w.string(inp.SellItem.item_ref);
		w.u32(inp.SellItem.qty);
	} else if ('JoinTable' in inp) {
		w.variant(19);
		w.string(inp.JoinTable.table_ref);
	} else if ('PlaceBet' in inp) {
		w.variant(21);
		w.u32(inp.PlaceBet.amount);
	} else if ('BjAction' in inp) {
		w.variant(22);
		w.variant(BJ[inp.BjAction.kind]);
	} else if ('Insure' in inp) {
		w.variant(23);
		w.u32(inp.Insure.amount);
	} else if ('Fell' in inp) {
		w.variant(24);
		writeTile(w, inp.Fell.tile);
	} else if ('EnterShip' in inp) {
		w.variant(25);
		w.u32(inp.EnterShip.ship);
	} else if ('ExitShip' in inp) {
		w.variant(26);
	} else if ('OpenCorpse' in inp) {
		w.variant(27);
		w.u32(inp.OpenCorpse.corpse);
	} else if ('TakeFromCorpse' in inp) {
		w.variant(28);
		w.u32(inp.TakeFromCorpse.corpse);
		w.u32(inp.TakeFromCorpse.slot);
	}
}

// --- ServerEvent decode (Binary postcard -> the externally-tagged shape the
// client already dispatches on: { Welcome } | { Snapshot } | { Ephemeral } |
// { Reject }). Enum discriminants map back to their Rust order. ---

const FACING_NAME: Facing[] = ['Down', 'Up', 'Left', 'Right'];
const STATUS_NAME: StatusKind[] = ['Poison', 'Regen', 'Haste', 'Burn'];

function readTile(r: PostcardReader): Tile {
	return { x: r.i32(), y: r.i32() };
}

function readKindEntry(r: PostcardReader): KindEntry {
	return { kind: r.u16(), ref: r.string(), cat: r.u8() };
}

function readStatusView(r: PostcardReader): StatusView {
	return { kind: STATUS_NAME[r.variant()], remaining: r.u16() };
}

function readPlayerView(r: PostcardReader): PlayerView {
	return { slot: r.u16(), kbve_username: r.string(), connected: r.bool() };
}

function readEntityDelta(r: PostcardReader): EntityDelta {
	const eid = r.u32();
	const kind = r.u16();
	const owner = r.u16();
	const tile = readTile(r);
	const facing = FACING_NAME[r.variant()];
	const sub = r.u8();
	const qx = r.i32();
	const qy = r.i32();
	const qvx = r.i16();
	const qvy = r.i16();
	const input_ack = r.u32();
	const hp = r.i32();
	const max_hp = r.i32();
	const destroyed = r.bool();
	const z = r.i32();
	const effects: StatusView[] = [];
	for (let n = r.seqLen(); n > 0; n--) effects.push(readStatusView(r));
	// Appended trailing field (postcard positional). A player piloting a ship carries
	// that ship's eid here; 0 = on foot. serde(default) on the server keeps old
	// encodings decodable, but server+client ship together so the byte is present.
	const piloting = r.u32();
	return {
		eid,
		kind,
		owner,
		tile,
		facing,
		sub,
		qx,
		qy,
		qvx,
		qvy,
		input_ack,
		hp,
		max_hp,
		destroyed,
		z,
		effects,
		piloting,
	};
}

function readSnapshot(r: PostcardReader): Snapshot {
	const tick = r.u32();
	const server_time_ms = r.u32();
	const input_ack = r.u32();
	const players: PlayerView[] = [];
	for (let n = r.seqLen(); n > 0; n--) players.push(readPlayerView(r));
	const entities: EntityDelta[] = [];
	for (let n = r.seqLen(); n > 0; n--) entities.push(readEntityDelta(r));
	const keyframe = r.bool();
	return { tick, server_time_ms, input_ack, players, entities, keyframe };
}

/** Decode a COBS-framed postcard ServerEvent (received as Binary). */
export function decodeServerEvent(frame: Uint8Array): ServerEvent {
	const r = new PostcardReader(cobsDecode(frame));
	const variant = r.variant();
	switch (variant) {
		case 0: {
			const protocol = r.u32();
			const your_slot = r.u16();
			const seed = Number(r.varU64());
			const registry: KindEntry[] = [];
			for (let n = r.seqLen(); n > 0; n--)
				registry.push(readKindEntry(r));
			return { Welcome: { protocol, your_slot, seed, registry } };
		}
		case 1:
			return { Snapshot: readSnapshot(r) };
		case 2: {
			const kind = r.u16();
			const to = r.u16();
			const payload: number[] = [];
			for (let n = r.seqLen(); n > 0; n--) payload.push(r.u8());
			return { Ephemeral: { kind, to, payload } };
		}
		case 3:
			return { Reject: { reason: r.string() } };
		default:
			throw new Error(`postcard: unknown ServerEvent variant ${variant}`);
	}
}

function readProjectile(r: PostcardReader): ProjectileEvent {
	const attacker = r.u32();
	const from = readTile(r);
	const to = readTile(r);
	const kind = r.string();
	const hit = r.bool();
	return { attacker, from, to, kind, hit };
}

/**
 * Decode an EPHEMERAL_PROJECTILE payload (raw postcard, NOT COBS — the outer
 * ServerEvent frame was already COBS-decoded and the payload bytes handed over
 * verbatim). Field order MUST match `proto::ProjectileEvent`. Every ephemeral
 * payload now rides postcard — see the decoders below for the rest.
 */
export function decodeProjectile(payload: number[]): ProjectileEvent {
	return readProjectile(new PostcardReader(Uint8Array.from(payload)));
}

function readFloorChange(r: PostcardReader): FloorChangeEvent {
	const z = r.i32();
	const tile = readTile(r);
	return { z, tile };
}

/** Decode an EPHEMERAL_FLOOR payload. Field order matches `proto::FloorChangeEvent`. */
export function decodeFloorChange(payload: number[]): FloorChangeEvent {
	return readFloorChange(new PostcardReader(Uint8Array.from(payload)));
}

function readPickup(r: PostcardReader): PickupEvent {
	const item_ref = r.string();
	const count = r.u32();
	return { item_ref, count };
}

/** Decode an EPHEMERAL_PICKUP payload. Field order matches `proto::PickupEvent`. */
export function decodePickup(payload: number[]): PickupEvent {
	return readPickup(new PostcardReader(Uint8Array.from(payload)));
}

function readPetBattleLog(r: PostcardReader): PetBattleLog {
	const lines: string[] = [];
	for (let n = r.seqLen(); n > 0; n--) lines.push(r.string());
	const outcome = r.string();
	return { lines, outcome };
}

/** Decode an EPHEMERAL_PET_BATTLE_LOG payload. Matches `proto::PetBattleLogEvent`. */
export function decodePetBattleLog(payload: number[]): PetBattleLog {
	return readPetBattleLog(new PostcardReader(Uint8Array.from(payload)));
}

/** Decode an EPHEMERAL_CORPSE payload (raw postcard). Field order matches
 * `proto::CorpseContents`: corpse u32, then a seq of (item_ref, count). */
export function decodeCorpse(payload: number[]): CorpseContents {
	const r = new PostcardReader(Uint8Array.from(payload));
	const corpse = r.u32();
	const items: [string, number][] = [];
	for (let n = r.seqLen(); n > 0; n--) items.push([r.string(), r.u32()]);
	return { corpse, items };
}

function readItemUsed(r: PostcardReader): ItemUsedEvent {
	const item_ref = r.string();
	const heal = r.i32();
	return { item_ref, heal };
}

/** Decode an EPHEMERAL_ITEM_USED payload. Field order matches `proto::ItemUsedEvent`. */
export function decodeItemUsed(payload: number[]): ItemUsedEvent {
	return readItemUsed(new PostcardReader(Uint8Array.from(payload)));
}

/** Option<String> — present tag then the string. */
function readOptString(r: PostcardReader): string | null {
	return r.option() ? r.string() : null;
}

function readCombat(r: PostcardReader): CombatEvent {
	const attacker = r.u32();
	const target = r.u32();
	const target_ref = readOptString(r);
	const dmg = r.i32();
	const crit = r.bool();
	const died = r.bool();
	return { attacker, target, target_ref, dmg, crit, died };
}

/** Decode an EPHEMERAL_COMBAT payload. Field order matches `proto::CombatEvent`. */
export function decodeCombat(payload: number[]): CombatEvent {
	return readCombat(new PostcardReader(Uint8Array.from(payload)));
}

function readEquipped(r: PostcardReader): EquippedEvent {
	const item_ref = readOptString(r);
	const slot = r.string() as EquippedEvent['slot'];
	const attack = r.i32();
	const defense = r.i32();
	return { item_ref, slot, attack, defense };
}

/** Decode an EPHEMERAL_EQUIPPED payload. Field order matches `proto::EquippedEvent`. */
export function decodeEquipped(payload: number[]): EquippedEvent {
	return readEquipped(new PostcardReader(Uint8Array.from(payload)));
}

function readStats(r: PostcardReader): StatsEvent {
	const level = r.i32();
	const xp = r.i32();
	const xp_next = r.i32();
	const max_hp = r.i32();
	const attack = r.i32();
	const kills = r.u32();
	const mp = r.i32();
	const max_mp = r.i32();
	return { level, xp, xp_next, max_hp, attack, kills, mp, max_mp };
}

/** Decode an EPHEMERAL_STATS payload. Field order matches `proto::StatsEvent`. */
export function decodeStats(payload: number[]): StatsEvent {
	return readStats(new PostcardReader(Uint8Array.from(payload)));
}

function readItemPlaced(r: PostcardReader): ItemPlacedEvent {
	const item_ref = r.string();
	const tile = readTile(r);
	const ok = r.bool();
	const reason = readOptString(r) ?? undefined;
	return { item_ref, tile, ok, reason };
}

/** Decode an EPHEMERAL_ITEM_PLACED payload. Field order matches `proto::ItemPlacedEvent`. */
export function decodeItemPlaced(payload: number[]): ItemPlacedEvent {
	return readItemPlaced(new PostcardReader(Uint8Array.from(payload)));
}

function readStatus(r: PostcardReader): StatusEvent {
	const kind = r.u8();
	const magnitude = r.i32();
	const remaining = r.u32();
	return { kind, magnitude, remaining };
}

/** Decode an EPHEMERAL_STATUS payload. Field order matches `proto::StatusEvent`. */
export function decodeStatus(payload: number[]): StatusEvent {
	return readStatus(new PostcardReader(Uint8Array.from(payload)));
}

function readInventory(r: PostcardReader): InventorySync {
	const items = [];
	for (let n = r.seqLen(); n > 0; n--) {
		const id = r.string();
		const ref = r.string();
		const count = r.u32();
		items.push({ id, ref, count });
	}
	return { items };
}

/** Decode an EPHEMERAL_INVENTORY payload. Field order matches `proto::InventorySync`. */
export function decodeInventory(payload: number[]): InventorySync {
	return readInventory(new PostcardReader(Uint8Array.from(payload)));
}

function readShop(r: PostcardReader): ShopResult {
	const action = r.string() as ShopResult['action'];
	const item_ref = r.string();
	const qty = r.u32();
	const ok = r.bool();
	const reason = r.string();
	const balance = r.u32();
	return { action, item_ref, qty, ok, reason, balance };
}

/** Decode an EPHEMERAL_SHOP payload. Field order matches `proto::ShopResult`. */
export function decodeShop(payload: number[]): ShopResult {
	return readShop(new PostcardReader(Uint8Array.from(payload)));
}

function readBlackjackHand(r: PostcardReader): BlackjackHandView {
	const cards: number[] = [];
	for (let n = r.seqLen(); n > 0; n--) cards.push(r.u8());
	const bet = r.u32();
	const value = r.u32();
	const soft = r.bool();
	const doubled = r.bool();
	const surrendered = r.bool();
	const done = r.bool();
	const outcome = readOptString(r);
	return { cards, bet, value, soft, doubled, surrendered, done, outcome };
}

function readBlackjackSeat(r: PostcardReader): BlackjackSeatView {
	const slot = r.u16();
	const username = r.string();
	const bet = r.u32();
	const insurance = r.u32();
	const hands: BlackjackHandView[] = [];
	for (let n = r.seqLen(); n > 0; n--) hands.push(readBlackjackHand(r));
	const disconnected = r.bool();
	return { slot, username, bet, insurance, hands, disconnected };
}

function readBlackjack(r: PostcardReader): BlackjackStateView {
	const table_ref = r.string();
	const phase = r.string();
	const seats: BlackjackSeatView[] = [];
	for (let n = r.seqLen(); n > 0; n--) seats.push(readBlackjackSeat(r));
	const dealer_hand: number[] = [];
	for (let n = r.seqLen(); n > 0; n--) dealer_hand.push(r.u8());
	const dealer_hidden = r.bool();
	const active_slot = r.option() ? r.u16() : null;
	const active_hand = r.option() ? r.u32() : null;
	const your_balance = r.u32();
	const deadline_ms = r.u32();
	const commitment = r.string();
	const seed = readOptString(r);
	return {
		table_ref,
		phase,
		seats,
		dealer_hand,
		dealer_hidden,
		active_slot,
		active_hand,
		your_balance,
		deadline_ms,
		commitment,
		seed,
	};
}

/** Decode an EPHEMERAL_BLACKJACK payload. Field order matches `proto::BlackjackStateView`. */
export function decodeBlackjack(payload: number[]): BlackjackStateView {
	return readBlackjack(new PostcardReader(Uint8Array.from(payload)));
}

function readTradeSide(r: PostcardReader): TradeSide {
	const items = [];
	for (let n = r.seqLen(); n > 0; n--) {
		const id = r.string();
		const ref = r.string();
		const count = r.u32();
		items.push({ id, ref, count });
	}
	const accepted = r.bool();
	return { items, accepted };
}

function readTrade(r: PostcardReader): TradeStateView {
	const status = r.string();
	const withSlot = r.u16();
	const you = readTradeSide(r);
	const them = readTradeSide(r);
	return { status, with: withSlot, you, them };
}

/** Decode an EPHEMERAL_TRADE payload. Field order matches `proto::TradeStateView`. */
export function decodeTrade(payload: number[]): TradeStateView {
	return readTrade(new PostcardReader(Uint8Array.from(payload)));
}

function readSpell(r: PostcardReader): SpellResult {
	const caster = r.u32();
	const target = r.option() ? r.u32() : null;
	const spell_ref = r.string();
	const effect = r.string();
	const amount = r.i32();
	const ok = r.bool();
	const reason = r.string();
	return { caster, target, spell_ref, effect, amount, ok, reason };
}

/** Decode an EPHEMERAL_SPELL payload. Field order matches `proto::SpellResult`. */
export function decodeSpell(payload: number[]): SpellResult {
	return readSpell(new PostcardReader(Uint8Array.from(payload)));
}

/** Encode a ClientMessage to a COBS-framed postcard buffer (sent as Binary). */
export function encodeClientMessage(msg: ClientMessage): Uint8Array {
	const w = new PostcardWriter();
	if ('JoinMatch' in msg) {
		w.variant(0);
		w.u32(msg.JoinMatch.protocol);
		w.string(msg.JoinMatch.jwt);
		w.string(msg.JoinMatch.kbve_username);
	} else {
		w.variant(1);
		const f = msg.Frame;
		w.u32(f.client_tick);
		w.seqLen(f.inputs.length);
		for (const inp of f.inputs) writeInput(w, inp);
	}
	return cobsEncode(w.bytes());
}
