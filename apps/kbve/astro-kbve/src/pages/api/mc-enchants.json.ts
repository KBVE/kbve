import { getCollection } from 'astro:content';

export const GET = async () => {
	const entries = await getCollection(
		'docs',
		(entry: { id: string; data: Record<string, unknown> }) => {
			return (
				entry.id.startsWith('mc/enchants/') &&
				Boolean(entry.data?.mc_enchant)
			);
		},
	);

	const items = entries
		.map(
			(entry: {
				id: string;
				data: { mc_enchant?: Record<string, unknown> };
			}) => {
				const e = entry.data.mc_enchant;
				if (!e) return null;
				return {
					id: e.id,
					ref: e.ref,
					slug: e.slug,
					display_name: e.display_name,
					rarity: e.rarity,
					max_level: e.max_level,
					weight: e.weight,
					treasure: e.treasure ?? false,
					curse: e.curse ?? false,
					targets: Array.isArray(e.targets) ? e.targets : [],
					tags: Array.isArray(e.tags) ? e.tags : [],
				};
			},
		)
		.filter(Boolean)
		.sort((a, b) =>
			String(a!.display_name).localeCompare(String(b!.display_name)),
		);

	const byRef: Record<string, number> = {};
	items.forEach((it, idx) => {
		if (it && typeof it.ref === 'string') byRef[it.ref] = idx;
	});

	return new Response(
		JSON.stringify({
			items,
			byRef,
			count: items.length,
			generated_at: new Date().toISOString(),
		}),
		{
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=300',
			},
		},
	);
};
