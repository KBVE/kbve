import {
	createWorld,
	addEntity,
	removeEntity,
	addComponent,
	SideMap,
	queryInRange,
	query,
	type World,
} from '@kbve/laser/ecs';
import {
	Position,
	Health,
	Kind,
	Owner,
	Active,
	PlayerTag,
	NpcTag,
	ItemTag,
	MonsterTag,
} from './components';

export type EntityCat = 'player' | 'npc' | 'item';

export interface SpawnData {
	tile: { x: number; y: number };
	kind: number;
	cat: EntityCat;
	owner: number;
	hostile: boolean;
	hp: number;
	maxHp: number;
}

export interface UpdateData {
	tile?: { x: number; y: number };
	hp?: number;
	maxHp?: number;
}

/**
 * ECS-backed entity registry. bitECS owns the blittable data (Position, Health,
 * Kind, Owner, Active + category tags); a SideMap holds the per-entity managed
 * refs (R — Phaser sprite/charId/nameplate/hpBar in the scene, stubs in tests).
 * Keyed externally by the server entity id; mapped to a dense bitECS eid
 * internally. Player and NPC are the same kind of entity — they differ only by
 * which tag/components they carry.
 */
export class EntityStore<R> {
	readonly world: World = createWorld();
	private toEid = new Map<number, number>();
	private toServer = new Map<number, number>();
	private sideRefs = new SideMap<R>();

	private tagFor(cat: EntityCat): Record<string, never> {
		return cat === 'player' ? PlayerTag : cat === 'npc' ? NpcTag : ItemTag;
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
		return eid;
	}

	update(serverEid: number, data: UpdateData): void {
		const eid = this.toEid.get(serverEid);
		if (eid === undefined) return;
		if (data.tile) {
			Position.x[eid] = data.tile.x;
			Position.y[eid] = data.tile.y;
		}
		if (data.hp !== undefined) Health.hp[eid] = data.hp;
		if (data.maxHp !== undefined) Health.maxHp[eid] = data.maxHp;
	}

	/** Remove the entity; returns its refs so the caller can tear down sprites. */
	despawn(serverEid: number): R | undefined {
		const eid = this.toEid.get(serverEid);
		if (eid === undefined) return undefined;
		const refs = this.sideRefs.delete(eid);
		removeEntity(this.world, eid);
		this.toEid.delete(serverEid);
		this.toServer.delete(eid);
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

	/** Iterate every live entity as [serverEid, eid, refs]. */
	*entries(): Generator<[number, number, R]> {
		for (const [serverEid, eid] of this.toEid) {
			const refs = this.sideRefs.get(eid);
			if (refs !== undefined) yield [serverEid, eid, refs];
		}
	}

	/** First server entity occupying a tile (excluding `exceptServer`). */
	at(
		tx: number,
		ty: number,
		exceptServer: number,
	): { serverEid: number; eid: number; refs: R } | null {
		for (const [serverEid, eid, refs] of this.entries()) {
			if (serverEid === exceptServer) continue;
			if (Position.x[eid] === tx && Position.y[eid] === ty) {
				return { serverEid, eid, refs };
			}
		}
		return null;
	}

	/** Count hostile (Monster-tagged) entities within `radius` of a point. */
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

	/** All server eids of a category (for roster/debug). */
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
