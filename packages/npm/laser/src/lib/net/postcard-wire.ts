// Protocol <-> postcard mapping. Discriminants + field order MUST match proto.rs
// exactly (postcard is positional). NB: the JSON `Input` union here lists UseItem
// before CastSpell, but Rust declares CastSpell=5, UseItem=6 — the maps below use
// the RUST order, which is authoritative for the wire.
import type {
	BjActionKind,
	ClientMessage,
	Dir,
	EntityDelta,
	Facing,
	Input,
	KindEntry,
	PlayerView,
	ServerEvent,
	Snapshot,
	StatusKind,
	StatusView,
	Tile,
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
