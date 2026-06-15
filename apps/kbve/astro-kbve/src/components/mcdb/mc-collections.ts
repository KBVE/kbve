import { getCollection } from 'astro:content';
import {
	MCLotFrontmatterSchema,
	MCPoiFrontmatterSchema,
	MCSchematicFrontmatterSchema,
	type MCLotFrontmatter,
	type MCPoiFrontmatter,
	type MCSchematicFrontmatter,
} from '@/data/schema';

type DocEntry = Awaited<ReturnType<typeof getCollection<'docs'>>>[number];

export type LotRow = MCLotFrontmatter & { slug: string; title: string };
export type PoiRow = MCPoiFrontmatter & { slug: string; title: string };
export type SchematicRow = MCSchematicFrontmatter & {
	slug: string;
	title: string;
};

function entrySlug(entry: DocEntry): string {
	return entry.id.replace(/\.mdx?$/, '').replace(/^mc\//, '');
}

function entryTitle(entry: DocEntry, fallback: string): string {
	const data = entry.data as { title?: unknown };
	return typeof data.title === 'string' ? data.title : fallback;
}

export async function getLotEntries(world?: string): Promise<LotRow[]> {
	const entries = await getCollection('docs');
	const out: LotRow[] = [];
	for (const entry of entries) {
		const raw = (entry.data as { mc_lot?: unknown }).mc_lot;
		if (raw === undefined) continue;
		const parsed = MCLotFrontmatterSchema.safeParse(raw);
		if (!parsed.success) continue;
		if (world !== undefined && parsed.data.world !== world) continue;
		out.push({
			...parsed.data,
			slug: entrySlug(entry),
			title: entryTitle(entry, parsed.data.lot_id),
		});
	}
	return out;
}

export async function getPoiEntries(world?: string): Promise<PoiRow[]> {
	const entries = await getCollection('docs');
	const out: PoiRow[] = [];
	for (const entry of entries) {
		const raw = (entry.data as { mc_poi?: unknown }).mc_poi;
		if (raw === undefined) continue;
		const parsed = MCPoiFrontmatterSchema.safeParse(raw);
		if (!parsed.success) continue;
		if (world !== undefined && parsed.data.world !== world) continue;
		out.push({
			...parsed.data,
			slug: entrySlug(entry),
			title: entryTitle(entry, parsed.data.display_name),
		});
	}
	return out;
}

export async function getSchematicEntries(): Promise<SchematicRow[]> {
	const entries = await getCollection('docs');
	const out: SchematicRow[] = [];
	for (const entry of entries) {
		const raw = (entry.data as { mc_schematic?: unknown }).mc_schematic;
		if (raw === undefined) continue;
		const parsed = MCSchematicFrontmatterSchema.safeParse(raw);
		if (!parsed.success) continue;
		out.push({
			...parsed.data,
			slug: entrySlug(entry),
			title: entryTitle(entry, parsed.data.display_name),
		});
	}
	return out;
}
