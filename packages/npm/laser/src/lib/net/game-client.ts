import { LaserEventBus } from '../core/events';
import { ReconnectingSocket, type ConnectionState } from './connection';
import {
	EPHEMERAL_COMBAT,
	EPHEMERAL_EQUIPPED,
	EPHEMERAL_INVENTORY,
	EPHEMERAL_ITEM_USED,
	EPHEMERAL_PICKUP,
	EPHEMERAL_SHOP,
	EPHEMERAL_STATS,
	type ClientMessage,
	type CombatEvent,
	type Dir,
	type Ephemeral,
	type EquippedEvent,
	type Facing,
	type Input,
	type InventorySync,
	type ItemUsedEvent,
	type PickupEvent,
	type ServerEvent,
	type ShopResult,
	type Snapshot,
	type StatsEvent,
	type Tile,
	type Welcome,
	decodeEphemeralPayload,
	inputFrame,
	joinFrame,
} from './protocol';

export type GameClientEventMap = {
	open: void;
	welcome: Welcome;
	snapshot: Snapshot;
	ephemeral: Ephemeral;
	inventory: InventorySync;
	combat: CombatEvent;
	pickup: PickupEvent;
	itemUsed: ItemUsedEvent;
	equipped: EquippedEvent;
	stats: StatsEvent;
	shop: ShopResult;
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

export class GameClient {
	private clientTick = 0;
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
		let msg: ServerEvent;
		try {
			msg = JSON.parse(
				typeof ev.data === 'string' ? ev.data : String(ev.data),
			);
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
			const data = decodeEphemeralPayload<InventorySync>(evt.payload);
			if (data) this.bus.emit('inventory', data);
		} else if (evt.kind === EPHEMERAL_COMBAT) {
			const data = decodeEphemeralPayload<CombatEvent>(evt.payload);
			if (data) this.bus.emit('combat', data);
		} else if (evt.kind === EPHEMERAL_PICKUP) {
			const data = decodeEphemeralPayload<PickupEvent>(evt.payload);
			if (data) this.bus.emit('pickup', data);
		} else if (evt.kind === EPHEMERAL_ITEM_USED) {
			const data = decodeEphemeralPayload<ItemUsedEvent>(evt.payload);
			if (data) this.bus.emit('itemUsed', data);
		} else if (evt.kind === EPHEMERAL_EQUIPPED) {
			const data = decodeEphemeralPayload<EquippedEvent>(evt.payload);
			if (data) this.bus.emit('equipped', data);
		} else if (evt.kind === EPHEMERAL_STATS) {
			const data = decodeEphemeralPayload<StatsEvent>(evt.payload);
			if (data) this.bus.emit('stats', data);
		} else if (evt.kind === EPHEMERAL_SHOP) {
			const data = decodeEphemeralPayload<ShopResult>(evt.payload);
			if (data) this.bus.emit('shop', data);
		}
	}

	private send(msg: ClientMessage): void {
		this.socket.send(JSON.stringify(msg));
	}

	sendInputs(inputs: Input[]): void {
		if (!this.socket.isOpen() || inputs.length === 0) return;
		this.clientTick += 1;
		this.send(inputFrame(this.clientTick, inputs));
	}

	step(dir: Dir): void {
		this.sendInputs([{ Step: { dir } }]);
	}

	moveTo(tile: Tile): void {
		this.sendInputs([{ MoveTo: { tile } }]);
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

	equipItem(itemRef: string): void {
		this.sendInputs([{ EquipItem: { item_ref: itemRef } }]);
	}

	buyItem(npc: number, itemRef: string, qty: number): void {
		this.sendInputs([{ BuyItem: { npc, item_ref: itemRef, qty } }]);
	}

	sellItem(npc: number, itemRef: string, qty: number): void {
		this.sendInputs([{ SellItem: { npc, item_ref: itemRef, qty } }]);
	}

	face(facing: Facing): void {
		this.sendInputs([{ Face: { facing } }]);
	}

	close(): void {
		this.sendInputs(['Leave']);
		this.socket.close();
	}
}
