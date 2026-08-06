import { getCollection } from 'astro:content';

export interface RelatedItem {
	label: string;
	href: string;
	rarity: string;
	reason: string;
}

interface ItemRecord {
	slug: string;
	name: string;
	ref: string;
	rarity: string;
	tags: string[];
	setRef?: string;
	typeFlags: number;
	drafted: boolean;
}

let cache: ItemRecord[] | null = null;

const slugOf = (id: string): string => id.replace(/\.(mdx|md)$/i, '');

const titleCase = (value: string): string =>
	value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function load(): Promise<ItemRecord[]> {
	if (cache) return cache;
	const raw = await getCollection('itemdb');
	cache = raw
		.map((entry: { id: string; data: Record<string, unknown> }) => {
			const d = entry.data;
			return {
				slug: slugOf(entry.id),
				name: (d.name as string) ?? titleCase(slugOf(entry.id)),
				ref: (d.ref as string) ?? slugOf(entry.id),
				rarity: (d.rarity as string) ?? 'common',
				tags: (d.tags as string[]) ?? [],
				setRef: d.set_ref as string | undefined,
				typeFlags: (d.type_flags as number) ?? 0,
				drafted: d.drafted === true,
			};
		})
		.filter((r) => !r.drafted && r.slug !== 'index');
	return cache;
}

export async function findRelated(
	data: Record<string, unknown>,
	limit = 6,
): Promise<RelatedItem[]> {
	const all = await load();
	const selfRef = (data.ref as string) ?? '';
	const explicit = (data.related_item_refs as string[]) ?? [];
	const setRef = data.set_ref as string | undefined;
	const tags = (data.tags as string[]) ?? [];
	const rarity = (data.rarity as string) ?? 'common';
	const flags = (data.type_flags as number) ?? 0;

	const picked = new Map<string, RelatedItem>();

	const add = (record: ItemRecord, reason: string) => {
		if (record.ref === selfRef || picked.has(record.ref)) return;
		if (picked.size >= limit) return;
		picked.set(record.ref, {
			label: record.name,
			href: `/itemdb/${record.slug}/`,
			rarity: titleCase(record.rarity),
			reason,
		});
	};

	for (const ref of explicit) {
		const match = all.find((r) => r.ref === ref);
		if (match) add(match, 'Linked');
	}

	if (setRef)
		for (const record of all)
			if (record.setRef === setRef) add(record, 'Same set');

	for (const tag of tags)
		for (const record of all)
			if (record.tags.includes(tag)) add(record, `#${tag}`);

	if (flags)
		for (const record of all)
			if ((record.typeFlags & flags) !== 0 && record.rarity === rarity)
				add(record, `${titleCase(rarity)} · same type`);

	for (const record of all)
		if (record.rarity === rarity) add(record, `${titleCase(rarity)} tier`);

	return [...picked.values()];
}
