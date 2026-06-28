import { LaserEventBus } from '../core/events';
import { ReconnectingSocket, type ConnectionState } from './connection';
import {
	EPHEMERAL_BLACKJACK,
	EPHEMERAL_COMBAT,
	EPHEMERAL_CORPSE,
	EPHEMERAL_EQUIPPED,
	EPHEMERAL_FLOOR,
	EPHEMERAL_INVENTORY,
	EPHEMERAL_ITEM_PLACED,
	EPHEMERAL_ITEM_USED,
	EPHEMERAL_PET_BATTLE_LOG,
	EPHEMERAL_PET_BATTLE_STATE,
	EPHEMERAL_PICKUP,
	EPHEMERAL_PROJECTILE,
	EPHEMERAL_SHOP,
	EPHEMERAL_STATS,
	type BjActionKind,
	type BlackjackStateView,
	type ClientMessage,
	type CombatEvent,
	type CorpseContents,
	type Ephemeral,
	type EquippedEvent,
	type Facing,
	type FloorChangeEvent,
	type Input,
	type InventorySync,
	type ItemPlacedEvent,
	type ItemUsedEvent,
	type PetBattleReplay,
	type PetBattleState,
	type PickupEvent,
	type ProjectileEvent,
	type ServerEvent,
	type ShopResult,
	type Snapshot,
	type StatsEvent,
	type Tile,
	type Welcome,
	inputFrame,
	joinFrame,
} from './protocol';
import {
	decodeBlackjack,
	decodeCombat,
	decodeCorpse,
	decodeEquipped,
	decodeFloorChange,
	decodeInventory,
	decodeItemPlaced,
	decodeItemUsed,
	decodePetBattleReplay,
	decodePetBattleState,
	decodePickup,
	decodeProjectile,
	decodeServerEvent,
	decodeShop,
	decodeStats,
	encodeClientMessage,
} from './postcard-wire';

export type GameClientEventMap = {
	open: void;
	welcome: Welcome;
	snapshot: Snapshot;
	ephemeral: Ephemeral;
	inventory: InventorySync;
	combat: CombatEvent;
	projectile: ProjectileEvent;
	floor: FloorChangeEvent;
	pickup: PickupEvent;
	corpse: CorpseContents;
	itemUsed: ItemUsedEvent;
	itemPlaced: ItemPlacedEvent;
	equipped: EquippedEvent;
	stats: StatsEvent;
	shop: ShopResult;
	blackjackState: BlackjackStateView;
	petBattleReplay: PetBattleReplay;
	petBattleState: PetBattleState;
	reject: string;
	state: ConnectionState;
	close: void;
	error: string;
};

export interface GameClientOptions {
	url: string;
	jwt: string;
	kbveUsername: string;
	/** Max reconnect attempts before going terminal. Default 3. */
	maxReconnects?: number;
}

export interface MoveSample {
	seq: number;
	mx: number;
	my: number;
	run: boolean;
}

export class GameClient {
	private clientTick = 0;
	private moveSeq = 0;
	private unackedMoves: MoveSample[] = [];
	private terminal = false;
	private readonly bus = new LaserEventBus<GameClientEventMap>();
	private readonly opts: GameClientOptions;
	private readonly socket: ReconnectingSocket;

	constructor(opts: GameClientOptions) {
		this.opts = opts;
		this.socket = new ReconnectingSocket(
			{
				url: opts.url,
				maxAttempts: opts.maxReconnects ?? 3,
				baseDelayMs: 1500,
				shouldReconnect: () => !this.terminal,
			},
			{
				onOpen: () => {
					this.send(joinFrame(this.opts.jwt, this.opts.kbveUsername));
					this.bus.emit('open', undefined);
				},
				onMessage: (ev) => this.handleMessage(ev),
				onState: (state) => {
					this.bus.emit('state', state);
					if (state.status === 'closed')
						this.bus.emit('close', undefined);
				},
			},
		);
	}

	on<K extends keyof GameClientEventMap>(
		event: K,
		handler: (data: GameClientEventMap[K]) => void,
	): () => void {
		return this.bus.on(event, handler);
	}

	getState(): ConnectionState {
		return this.socket.getState();
	}

	connect(): void {
		this.socket.connect();
	}

	/** Stop reconnecting — the server turned us away for good. */
	markTerminal(): void {
		this.terminal = true;
	}

	private handleMessage(ev: MessageEvent): void {
		// Postcard-only wire: every frame is COBS-framed postcard (ArrayBuffer).
		if (!(ev.data instanceof ArrayBuffer)) return;
		let msg: ServerEvent;
		try {
			msg = decodeServerEvent(new Uint8Array(ev.data));
		} catch {
			return;
		}
		if ('Welcome' in msg) this.bus.emit('welcome', msg.Welcome);
		else if ('Snapshot' in msg) this.bus.emit('snapshot', msg.Snapshot);
		else if ('Ephemeral' in msg) this.handleEphemeral(msg.Ephemeral);
		else if ('Reject' in msg) {
			this.terminal = true;
			this.bus.emit('reject', msg.Reject.reason);
		}
	}

	private handleEphemeral(evt: Ephemeral): void {
		this.bus.emit('ephemeral', evt);
		if (evt.kind === EPHEMERAL_INVENTORY) {
			const data = decodeInventory(evt.payload);
			if (data) this.bus.emit('inventory', data);
		} else if (evt.kind === EPHEMERAL_COMBAT) {
			const data = decodeCombat(evt.payload);
			if (data) this.bus.emit('combat', data);
		} else if (evt.kind === EPHEMERAL_PROJECTILE) {
			const data = decodeProjectile(evt.payload);
			if (data) this.bus.emit('projectile', data);
		} else if (evt.kind === EPHEMERAL_FLOOR) {
			const data = decodeFloorChange(evt.payload);
			if (data) this.bus.emit('floor', data);
		} else if (evt.kind === EPHEMERAL_PICKUP) {
			const data = decodePickup(evt.payload);
			if (data) this.bus.emit('pickup', data);
		} else if (evt.kind === EPHEMERAL_CORPSE) {
			const data = decodeCorpse(evt.payload);
			if (data) this.bus.emit('corpse', data);
		} else if (evt.kind === EPHEMERAL_ITEM_USED) {
			const data = decodeItemUsed(evt.payload);
			if (data) this.bus.emit('itemUsed', data);
		} else if (evt.kind === EPHEMERAL_ITEM_PLACED) {
			const data = decodeItemPlaced(evt.payload);
			if (data) this.bus.emit('itemPlaced', data);
		} else if (evt.kind === EPHEMERAL_EQUIPPED) {
			const data = decodeEquipped(evt.payload);
			if (data) this.bus.emit('equipped', data);
		} else if (evt.kind === EPHEMERAL_STATS) {
			const data = decodeStats(evt.payload);
			if (data) this.bus.emit('stats', data);
		} else if (evt.kind === EPHEMERAL_SHOP) {
			const data = decodeShop(evt.payload);
			if (data) this.bus.emit('shop', data);
		} else if (evt.kind === EPHEMERAL_BLACKJACK) {
			const data = decodeBlackjack(evt.payload);
			if (data) this.bus.emit('blackjackState', data);
		} else if (evt.kind === EPHEMERAL_PET_BATTLE_LOG) {
			const data = decodePetBattleReplay(evt.payload);
			if (data) this.bus.emit('petBattleReplay', data);
		} else if (evt.kind === EPHEMERAL_PET_BATTLE_STATE) {
			const data = decodePetBattleState(evt.payload);
			if (data) this.bus.emit('petBattleState', data);
		}
	}

	private send(msg: ClientMessage): void {
		// Postcard-only: Binary frames; the server follows suit off the first one.
		this.socket.send(encodeClientMessage(msg));
	}

	sendInputs(inputs: Input[]): void {
		if (!this.socket.isOpen() || inputs.length === 0) return;
		this.clientTick += 1;
		this.send(inputFrame(this.clientTick, inputs));
	}

	move(mx: number, my: number, run: boolean, tick: number): number {
		this.moveSeq += 1;
		const seq = this.moveSeq;
		this.unackedMoves.push({ seq, mx, my, run });
		if (this.unackedMoves.length > 256) this.unackedMoves.shift();
		this.sendInputs([{ Move: { seq, mx, my, run, tick } }]);
		return seq;
	}

	ackMoves(ack: number): MoveSample[] {
		if (ack > 0) {
			this.unackedMoves = this.unackedMoves.filter((m) => m.seq > ack);
		}
		return this.unackedMoves;
	}

	action(id: number, target: number | null): void {
		this.sendInputs([{ Action: { id, target } }]);
	}

	heartbeat(): void {
		this.sendInputs([{ Heartbeat: { client_tick: this.clientTick } }]);
	}

	useItem(itemRef: string): void {
		this.sendInputs([{ UseItem: { item_ref: itemRef } }]);
	}

	/** Debug: ask the server to START an interactive 5v5 mechamutt battle. The server
	 * replies with a `petBattleState` (awaiting the player's first action). */
	simPetBattle(): void {
		this.sendInputs(['SimPetBattle']);
	}

	/** Commit one action for the active interactive pet battle: `action` is a
	 * PET_ACT_* code, `arg` the move slot (MOVE) or reserve index (SWAP). */
	petTurn(action: number, arg: number): void {
		this.sendInputs([{ PetTurn: { action, arg } }]);
	}

	castSpell(spellRef: string, target: number | null): void {
		this.sendInputs([{ CastSpell: { spell_ref: spellRef, target } }]);
	}

	dropItem(itemRef: string, qty: number): void {
		this.sendInputs([{ DropItem: { item_ref: itemRef, qty } }]);
	}

	moveItem(from: number, to: number): void {
		this.sendInputs([{ MoveItem: { from, to } }]);
	}

	equipItem(itemRef: string): void {
		this.sendInputs([{ EquipItem: { item_ref: itemRef } }]);
	}

	/** Board `ship` (its server eid) and become its pilot. */
	enterShip(ship: number): void {
		this.sendInputs([{ EnterShip: { ship } }]);
	}

	/** Leave the ship currently being piloted. */
	exitShip(): void {
		this.sendInputs(['ExitShip']);
	}

	/** Launch the flying ship off-planet into the solo 3D space instance. The server
	 * plays the leaving cutscene then takes the ship + pilot off-grid. */
	launchSpace(): void {
		this.sendInputs(['LaunchSpace']);
	}

	/** Return from the space instance — the server re-materialises the ship at the
	 * launch tile and plays the entering cutscene back into flight. */
	returnSpace(): void {
		this.sendInputs(['ReturnSpace']);
	}

	placeItem(itemRef: string, tile: Tile, rot = 0): void {
		this.sendInputs([{ PlaceItem: { item_ref: itemRef, tile, rot } }]);
	}

	/** Open a corpse's loot panel — server replies with a `corpse` event. */
	openCorpse(corpse: number): void {
		this.sendInputs([{ OpenCorpse: { corpse } }]);
	}

	/** Take one slot from an open corpse — server re-sends the updated `corpse`. */
	takeFromCorpse(corpse: number, slot: number): void {
		this.sendInputs([{ TakeFromCorpse: { corpse, slot } }]);
	}

	pickupObject(tile: Tile): void {
		this.sendInputs([{ PickupObject: { tile } }]);
	}

	fell(tile: Tile): void {
		this.sendInputs([{ Fell: { tile } }]);
	}

	buyItem(npc: number, itemRef: string, qty: number): void {
		this.sendInputs([{ BuyItem: { npc, item_ref: itemRef, qty } }]);
	}

	sellItem(npc: number, itemRef: string, qty: number): void {
		this.sendInputs([{ SellItem: { npc, item_ref: itemRef, qty } }]);
	}

	joinTable(tableRef: string): void {
		this.sendInputs([{ JoinTable: { table_ref: tableRef } }]);
	}

	leaveTable(): void {
		this.sendInputs(['LeaveTable']);
	}

	placeBet(amount: number): void {
		this.sendInputs([{ PlaceBet: { amount } }]);
	}

	bjAction(kind: BjActionKind): void {
		this.sendInputs([{ BjAction: { kind } }]);
	}

	insure(amount: number): void {
		this.sendInputs([{ Insure: { amount } }]);
	}

	face(facing: Facing): void {
		this.sendInputs([{ Face: { facing } }]);
	}

	close(): void {
		this.sendInputs(['Leave']);
		this.socket.close();
	}
}
