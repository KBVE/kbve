import { getCollection, type CollectionEntry } from 'astro:content';
import type { APIRoute } from 'astro';

// We'll use the collection key "discord"
const COLLECTION = 'discord' as const;

type DiscordEntry = CollectionEntry<typeof COLLECTION>;

export const GET: APIRoute = async () => {
	const entries = await getCollection(COLLECTION);

	// Build a record where each server_id maps to the full entry data
	const result: Record<string, DiscordEntry['data']> = {};

	for (const entry of entries) {
		const { server_id } = entry.data;
		result[server_id] = entry.data;
	}

	return new Response(JSON.stringify(result, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=0, must-revalidate',
		},
	});
};
