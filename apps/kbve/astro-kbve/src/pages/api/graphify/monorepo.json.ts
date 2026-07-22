import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * API endpoint for the monorepo semantic knowledge graph.
 *
 * Derives a flat ``{nodes, edges, communities}`` graph from the committed
 * tiered explorer data (``public/graphify/overview.json``) so the endpoint is
 * always populated at build time without depending on the external ``graphify``
 * binary. The envelope matches the full Graphify export, so a richer
 * symbol-level graph can be swapped in later without changing consumers.
 *
 * @endpoint GET /api/graphify/monorepo.json
 * @returns JSON graph data with nodes, edges, and communities
 */

interface DirNode {
	id: string;
	label: string;
	x: number;
	y: number;
	r: number;
	n: number;
	files: number;
	c: number;
}

type DirEdge = [number, number, number, number];

interface Overview {
	meta: {
		dirs: number;
		files: number;
		symbols: number;
		dirEdges: number;
		built_at_commit: string;
		scale: number;
		relations: string[];
	};
	dirs: DirNode[];
	dirEdges: DirEdge[];
}

const topLevel = (label: string): string => {
	const seg = label.split('/')[0];
	return seg && seg.length ? seg : '(root)';
};

export const GET: APIRoute = async () => {
	try {
		const overviewPath = join(
			process.cwd(),
			'public/graphify/overview.json',
		);
		const overview: Overview = JSON.parse(
			await readFile(overviewPath, 'utf-8'),
		);

		const relations = overview.meta.relations ?? [];

		const nodes = overview.dirs.map((d) => ({
			id: d.id,
			label: d.label,
			type: 'directory',
			group: topLevel(d.label),
			files: d.files,
			symbols: d.n,
			x: d.x,
			y: d.y,
			r: d.r,
		}));

		const edges = overview.dirEdges
			.map(([s, t, weight, rel]) => {
				const source = overview.dirs[s]?.id;
				const target = overview.dirs[t]?.id;
				if (!source || !target) return null;
				return {
					source,
					target,
					weight,
					relation: relations[rel] ?? 'other',
				};
			})
			.filter((e): e is NonNullable<typeof e> => e !== null);

		const byGroup = new Map<string, string[]>();
		for (const n of nodes) {
			const bucket = byGroup.get(n.group) ?? [];
			bucket.push(n.id);
			byGroup.set(n.group, bucket);
		}
		const communities = [...byGroup.entries()]
			.map(([id, members]) => ({
				id,
				label: id,
				size: members.length,
				members,
			}))
			.sort((a, b) => b.size - a.size);

		const response = {
			metadata: {
				source: 'graphify',
				type: 'semantic-knowledge-graph',
				scope: 'monorepo',
				derivedFrom: 'tiered-overview',
				generated: overview.meta.built_at_commit,
				counts: {
					nodes: nodes.length,
					edges: edges.length,
					communities: communities.length,
					files: overview.meta.files,
					symbols: overview.meta.symbols,
				},
			},
			graph: { nodes, edges, communities },
		};

		return new Response(JSON.stringify(response), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=3600',
				'X-Graph-Type': 'graphify-semantic',
			},
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				metadata: {
					source: 'graphify',
					type: 'semantic-knowledge-graph',
					scope: 'monorepo',
					status: 'not-generated',
					message:
						'Graph source missing. Expected public/graphify/overview.json (run: pnpm nx run graphify-wrapper:build-monorepo).',
				},
				graph: {
					nodes: [],
					edges: [],
					communities: [],
				},
			}),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'X-Graph-Status': 'pending',
				},
			},
		);
	}
};
