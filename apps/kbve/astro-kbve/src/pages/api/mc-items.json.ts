import { getCollection } from 'astro:content';

/**
 * `/api/mc-items.json` — flat index of every MC item with a published MDX
 * page. Built at SSG time from the docs collection (frontmatter
 * `mc_item:` block). Consumed by the marketplace create-form picker and
 * any future autocomplete surface.
 */
export const GET = async () => {
	const entries = await getCollection(
		'docs',
		(entry: { id: string; data: Record<string, unknown> }) => {
			return (
				entry.id.startsWith('mc/items/') && Boolean(entry.data?.mc_item)
			);
		},
	);

	const items = entries
		.map(
			(entry: {
				id: string;
				data: { mc_item?: Record<string, unknown> };
			}) => {
				const mc = entry.data.mc_item;
				if (!mc) return null;
				return {
					id: mc.id,
					ref: mc.ref,
					slug: mc.slug,
					display_name: mc.display_name,
					category: mc.category,
					rarity: mc.rarity,
					stack_size: mc.stack_size,
					tier: mc.tier ?? null,
					tags: mc.tags ?? [],
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
