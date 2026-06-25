import {
	createWorld,
	addEntity,
	removeEntity,
	addComponent,
	query,
	type World,
} from './bitecs';
import { SideMap, queryInRange, packTile } from './helpers';
import type { StatusView } from '../net/protocol';
import {
	Position,
	Health,
	Kind,
	Owner,
	Active,
	PlayerTag,
	NpcTag,
	ItemTag,
	EnvTag,
	MonsterTag,
} from './components';

/**
 * Entity category as a numeric tag matching the wire protocol's `KindEntry.cat`
 * (0..3, server-authoritative). Kept numeric — not a string union — so it crosses
 * a worker / WASM boundary as a plain int (shared/transferable typed arrays, no
 * structured-clone or encode/decode marshalling) and compares as a branchless
 * integer on the hot sim paths.
 */
export const Cat = {
	Player: 0,
	Npc: 1,
	Item: 2,
	Env: 3,
} as const;
export type EntityCat = (typeof Cat)[keyof typeof Cat];

export interface SpawnData {
	tile: { x: number; y: number };
	kind: number;
	cat: EntityCat;
	owner: number;
	hostile: boolean;
	hp: number;
	maxHp: number;
	effects?: StatusView[];
}

export interface UpdateData {
	tile?: { x: number; y: number };
	hp?: number;
	maxHp?: number;
	effects?: StatusView[];
}

const NO_EFFECTS: readonly StatusView[] = [];

export class EntityStore<R> {
	readonly world: World = createWorld();
	private toEid = new Map<number, number>();
	private toServer = new Map<number, number>();
	private sideRefs = new SideMap<R>();
	private effectsMap = new Map<number, StatusView[]>();
	// Spatial index: packed tile key -> eids occupying that tile. Maintained on
	// spawn/update/despawn so at() is an O(bucket) lookup instead of an O(n) scan
	// over every entity (it runs several times per frame: cursor, pickup, click,
	// arrow hit-test).
	private byTile = new Map<number, Set<number>>();

	private indexAdd(eid: number, x: number, y: number): void {
		const key = packTile(x, y);
		let bucket = this.byTile.get(key);
		if (!bucket) this.byTile.set(key, (bucket = new Set()));
		bucket.add(eid);
	}

	private indexRemove(eid: number, x: number, y: number): void {
		const key = packTile(x, y);
		const bucket = this.byTile.get(key);
		if (!bucket) return;
		bucket.delete(eid);
		if (bucket.size === 0) this.byTile.delete(key);
	}

	private tagFor(cat: EntityCat): Record<string, never> {
		return cat === Cat.Player
			? PlayerTag
			: cat === Cat.Npc
				? NpcTag
				: cat === Cat.Env
					? EnvTag
					: ItemTag;
	}

	has(serverEid: number): boolean {
		return this.toEid.has(serverEid);
	}

	size(): number {
		return this.toEid.size;
	}

	spawn(serverEid: number, data: SpawnData, refs: R): number {
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, Health);
		addComponent(this.world, eid, Kind);
		addComponent(this.world, eid, Owner);
		addComponent(this.world, eid, Active);
		addComponent(this.world, eid, this.tagFor(data.cat));
		if (data.hostile) addComponent(this.world, eid, MonsterTag);
		Position.x[eid] = data.tile.x;
		Position.y[eid] = data.tile.y;
		Health.hp[eid] = data.hp;
		Health.maxHp[eid] = data.maxHp;
		Kind.value[eid] = data.kind;
		Owner.slot[eid] = data.owner;
		Active.value[eid] = 1;
		this.toEid.set(serverEid, eid);
		this.toServer.set(eid, serverEid);
		this.sideRefs.set(eid, refs);
		this.indexAdd(eid, data.tile.x, data.tile.y);
		if (data.effects) this.effectsMap.set(serverEid, data.effects);
		return eid;
	}

	update(serverEid: number, data: UpdateData): void {
		const eid = this.toEid.get(serverEid);
		if (eid === undefined) return;
		if (data.tile) {
			const ox = Position.x[eid];
			const oy = Position.y[eid];
			if (data.tile.x !== ox || data.tile.y !== oy) {
				this.indexRemove(eid, ox, oy);
				this.indexAdd(eid, data.tile.x, data.tile.y);
			}
			Position.x[eid] = data.tile.x;
			Position.y[eid] = data.tile.y;
		}
		if (data.hp !== undefined) Health.hp[eid] = data.hp;
		if (data.maxHp !== undefined) Health.maxHp[eid] = data.maxHp;
		if (data.effects !== undefined) {
			if (data.effects.length)
				this.effectsMap.set(serverEid, data.effects);
			else this.effectsMap.delete(serverEid);
		}
	}

	despawn(serverEid: number): R | undefined {
		const eid = this.toEid.get(serverEid);
		if (eid === undefined) return undefined;
		const refs = this.sideRefs.delete(eid);
		this.indexRemove(eid, Position.x[eid], Position.y[eid]);
		removeEntity(this.world, eid);
		this.toEid.delete(serverEid);
		this.toServer.delete(eid);
		this.effectsMap.delete(serverEid);
		return refs;
	}

	refs(serverEid: number): R | undefined {
		const eid = this.toEid.get(serverEid);
		return eid === undefined ? undefined : this.sideRefs.get(eid);
	}

	eid(serverEid: number): number | undefined {
		return this.toEid.get(serverEid);
	}

	tile(serverEid: number): { x: number; y: number } | null {
		const eid = this.toEid.get(serverEid);
		if (eid === undefined) return null;
		return { x: Position.x[eid], y: Position.y[eid] };
	}

	hp(serverEid: number): number {
		const eid = this.toEid.get(serverEid);
		return eid === undefined ? 0 : Health.hp[eid];
	}

	maxHp(serverEid: number): number {
		const eid = this.toEid.get(serverEid);
		return eid === undefined ? 0 : Health.maxHp[eid];
	}

	kind(serverEid: number): number {
		const eid = this.toEid.get(serverEid);
		return eid === undefined ? -1 : Kind.value[eid];
	}

	owner(serverEid: number): number {
		const eid = this.toEid.get(serverEid);
		return eid === undefined ? -1 : Owner.slot[eid];
	}

	effects(serverEid: number): readonly StatusView[] {
		return this.effectsMap.get(serverEid) ?? NO_EFFECTS;
	}

	*entries(): Generator<[number, number, R]> {
		for (const [serverEid, eid] of this.toEid) {
			const refs = this.sideRefs.get(eid);
			if (refs !== undefined) yield [serverEid, eid, refs];
		}
	}

	at(
		tx: number,
		ty: number,
		exceptServer: number,
	): { serverEid: number; eid: number; refs: R } | null {
		const bucket = this.byTile.get(packTile(tx, ty));
		if (!bucket) return null;
		for (const eid of bucket) {
			const serverEid = this.toServer.get(eid);
			if (serverEid === undefined || serverEid === exceptServer) continue;
			const refs = this.sideRefs.get(eid);
			if (refs !== undefined) return { serverEid, eid, refs };
		}
		return null;
	}

	hostilesInRange(cx: number, cy: number, radius: number): number {
		let n = 0;
		for (const _ of queryInRange(
			this.world,
			[Position, MonsterTag],
			Position,
			cx,
			cy,
			radius,
		)) {
			n += 1;
		}
		return n;
	}

	serverIdsWith(cat: EntityCat): number[] {
		const tag = this.tagFor(cat);
		const out: number[] = [];
		for (const eid of query(this.world, [tag])) {
			const s = this.toServer.get(eid);
			if (s !== undefined) out.push(s);
		}
		return out;
	}
}
