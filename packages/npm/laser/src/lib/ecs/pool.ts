import { query, type World } from './bitecs';

// Reconciling object pool: keeps a Map<eid, T> in sync with the entities matching
// `terms`. On reconcile, entities that newly match get a created T; entities that
// stopped matching get their T destroyed. Subclasses supply create/destroy and
// own whatever render object T is — the base stays render-agnostic.
export abstract class EntityPool<T> {
	protected items = new Map<number, T>();

	constructor(protected readonly terms: readonly unknown[]) {}

	protected abstract create(eid: number): T;
	protected abstract destroy(item: T): void;

	reconcile(world: World): void {
		const live = new Set<number>();
		for (const eid of query(world, this.terms as never)) {
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

	get size(): number {
		return this.items.size;
	}

	entries(): IterableIterator<[number, T]> {
		return this.items.entries();
	}
}
