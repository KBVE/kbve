import itemdbBundle from '@kbve/itemdb-data';
import type { Item } from '@kbve/itemdb-schema';

export interface ModelRef {
	ref: string;
	set: 'KNGT' | 'SCFI09' | 'SCFI10' | 'HORR01';
	nodes: string[];
	slot_keys: string[];
	covers?: string[];
}

interface ModelBlock {
	pack?: string;
	set?: ModelRef['set'];
	nodes?: string[];
	slot_keys?: string[];
	covers?: string[];
}

const bundle = itemdbBundle as {
	items: (Item & { model?: ModelBlock })[];
};

export const ITEMS_BY_REF = new Map<string, Item>(
	bundle.items.map((i) => [i.ref, i]),
);

export function itemByRef(ref: string): Item | undefined {
	return ITEMS_BY_REF.get(ref);
}

/** Wardrobe pieces: every itemdb entry whose model block names SIDEKICK. */
export function sidekickModels(): ModelRef[] {
	const out: ModelRef[] = [];
	for (const it of bundle.items) {
		const m = it.model;
		if (m?.pack !== 'SIDEKICK' || !m.set || !m.nodes || !m.slot_keys)
			continue;
		out.push({
			ref: it.ref,
			set: m.set,
			nodes: m.nodes,
			slot_keys: m.slot_keys,
			covers: m.covers,
		});
	}
	return out;
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
