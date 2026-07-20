import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * API endpoint for monorepo semantic knowledge graph.
 * Serves Graphify-generated graph data.
 *
 * @endpoint GET /api/graphify/monorepo.json
 * @returns JSON graph data with nodes, edges, and communities
 */
export const GET: APIRoute = async () => {
	try {
		// Path to generated graph file
		const graphPath = join(
			process.cwd(),
			'../../../packages/data/graphify/output/monorepo/graph.json',
		);

		const graphData = await readFile(graphPath, 'utf-8');
		const graph = JSON.parse(graphData);

		// Add metadata
		const response = {
			metadata: {
				source: 'graphify',
				type: 'semantic-knowledge-graph',
				scope: 'monorepo',
				generated:
					graph.metadata?.generated || new Date().toISOString(),
			},
			graph,
		};

		return new Response(JSON.stringify(response), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
				'X-Graph-Type': 'graphify-semantic',
			},
		});
	} catch (error) {
		// Graph not yet built - return empty structure
		return new Response(
			JSON.stringify({
				metadata: {
					source: 'graphify',
					type: 'semantic-knowledge-graph',
					scope: 'monorepo',
					status: 'not-generated',
					message:
						'Graph not yet generated. Run: pnpm nx run graphify-wrapper:build-monorepo',
				},
				graph: {
					nodes: [],
					edges: [],
					communities: [],
				},
			}),
			{
				status: 200, // Return 200 with empty graph instead of error
				headers: {
					'Content-Type': 'application/json',
					'X-Graph-Status': 'pending',
				},
			},
		);
	}
};
