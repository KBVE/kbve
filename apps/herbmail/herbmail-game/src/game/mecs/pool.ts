import { query, type World } from './props';

// Reconciling object pool over the mecs dungeon world: keeps a Map<eid, T> in sync
// with the entities matching `terms`. On reconcile, newly-matching entities get a
// created T; entities that stopped matching get their T destroyed. Subclasses supply
// create/destroy and own whatever render object T is. Same contract as laser's
// EntityPool, but driven by the mecs query so props render off the shared world.
export abstract class EntityPool<T> {
	protected items = new Map<number, T>();

	constructor(protected readonly terms: readonly unknown[]) {}

	protected abstract create(eid: number): T;
	protected abstract destroy(item: T): void;

	reconcile(world: World): void {
		const live = new Set<number>();
		for (const eid of query(world, this.terms as readonly object[])) {
			live.add(eid);
			if (!this.items.has(eid)) this.items.set(eid, this.create(eid));
		}
		for (const [eid, item] of this.items) {
			if (live.has(eid)) continue;
			this.destroy(item);
			this.items.delete(eid);
		}
	}

	dispose(): void {
		for (const item of this.items.values()) this.destroy(item);
		this.items.clear();
	}

	entries(): IterableIterator<[number, T]> {
		return this.items.entries();
	}
}
