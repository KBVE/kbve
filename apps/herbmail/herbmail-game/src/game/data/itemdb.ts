import itemdbBundle from '@kbve/itemdb-data';
import type { Item } from '@kbve/itemdb-schema';

const bundle = itemdbBundle as { items: Item[] };

export const ITEMS_BY_REF = new Map<string, Item>(
	bundle.items.map((i) => [i.ref, i]),
);

export function itemByRef(ref: string): Item | undefined {
	return ITEMS_BY_REF.get(ref);
}

export function itemLabel(ref: string): string {
	return ITEMS_BY_REF.get(ref)?.name ?? ref;
}

/** Numeric stat off an item's equipment bonuses; `weight` lives in extra. */
export function itemStat(ref: string, key: string): number {
	const b = ITEMS_BY_REF.get(ref)?.equipment?.bonuses as
		| Record<string, unknown>
		| undefined;
	if (!b) return 0;
	const direct = b[key];
	if (typeof direct === 'number') return direct;
	const extra = b.extra as Record<string, number> | undefined;
	return typeof extra?.[key] === 'number' ? extra[key] : 0;
}
