import { getCollection } from 'astro:content';

const ENUM_PREFIX: Record<string, string> = {
	type: 'WORLD_OBJECT_',
	resourceType: 'RESOURCE_',
	containerType: 'CONTAINER_',
	craftingStationType: 'CRAFTING_STATION_',
	footprintShape: 'FOOTPRINT_SHAPE_',
	costSource: 'COST_SOURCE_',
	kind: 'SERVICE_KIND_',
};

const ASTRO_ONLY_FIELDS = new Set([
	'pixelsPerUnit',
	'pivot',
	'pivotX',
	'pivotY',
	'meshType',
	'extrudeEdges',
	'sortingLayer',
	'sortingIndex',
	'staticSorting',
	'wrapMode',
	'animation',
	'title',
]);

function snakeToCamel(key: string): string {
	return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// See gen-mapdb-data.mjs — same path-scoped escape hatch for fields
// whose name collides across multiple proto messages.
const ENUM_SKIP_UNDER_GRANDPARENT: Record<string, Set<string>> = {
	resourceType: new Set(['buildCosts']),
};

function transform(
	node: unknown,
	parentFieldCamel?: string,
	grandparentFieldCamel?: string,
): unknown {
	if (node === null || node === undefined) return node;
	if (Array.isArray(node)) {
		return node.map((child) =>
			transform(child, parentFieldCamel, grandparentFieldCamel),
		);
	}
	if (typeof node === 'object') {
		const out: Record<string, unknown> = {};
		for (const [rawKey, rawValue] of Object.entries(
			node as Record<string, unknown>,
		)) {
			const camelKey = snakeToCamel(rawKey);
			if (ASTRO_ONLY_FIELDS.has(camelKey)) continue;
			out[camelKey] = transform(rawValue, camelKey, parentFieldCamel);
		}
		return out;
	}
	if (
		parentFieldCamel &&
		ENUM_PREFIX[parentFieldCamel] &&
		typeof node === 'string'
	) {
		const skip = ENUM_SKIP_UNDER_GRANDPARENT[parentFieldCamel];
		if (skip && grandparentFieldCamel && skip.has(grandparentFieldCamel)) {
			return node;
		}
		return `${ENUM_PREFIX[parentFieldCamel]}${node.toUpperCase()}`;
	}
	return node;
}

export const GET = async () => {
	const entries = (await getCollection('mapdb')).filter(
		(entry) =>
			!entry.id.endsWith('index.mdx') && entry.data.drafted !== true,
	);

	const objectDefs: unknown[] = [];
	for (const entry of entries) {
		const { id, ref, name, type } = entry.data;
		if (!id || !ref || !name || !type) continue;
		objectDefs.push(transform(entry.data));
	}

	return new Response(JSON.stringify({ objectDefs }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
