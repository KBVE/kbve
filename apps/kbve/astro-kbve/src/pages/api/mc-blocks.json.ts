import { getCollection } from 'astro:content';

export const GET = async () => {
	const entries = await getCollection(
		'docs',
		(entry: { id: string; data: Record<string, unknown> }) => {
			return (
				entry.id.startsWith('mc/blocks/') &&
				Boolean(entry.data?.mc_block)
			);
		},
	);

	const items = entries
		.map(
			(entry: {
				id: string;
				data: { mc_block?: Record<string, unknown> };
			}) => {
				const b = entry.data.mc_block;
				if (!b) return null;
				return {
					id: b.id,
					ref: b.ref,
					slug: b.slug,
					display_name: b.display_name,
					material: b.material,
					hardness: b.hardness,
					blast_resistance: b.blast_resistance,
					best_tool: b.best_tool,
					required_tool_tier: b.required_tool_tier ?? 0,
					tags: Array.isArray(b.tags) ? b.tags : [],
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
