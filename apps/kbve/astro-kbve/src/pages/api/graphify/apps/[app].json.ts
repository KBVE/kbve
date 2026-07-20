import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * API endpoint for app-specific semantic knowledge graphs.
 * Serves Graphify-generated graph data for individual apps.
 *
 * @endpoint GET /api/graphify/apps/{app}.json
 * @param app - App name (e.g., herbmail, laser, discordsh)
 * @returns JSON graph data scoped to the specified app
 */
export const GET: APIRoute = async ({ params }) => {
	const { app } = params;

	if (!app) {
		return new Response(JSON.stringify({ error: 'App name required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		// Path to app-specific graph file
		const graphPath = join(
			process.cwd(),
			`../../../packages/data/graphify/output/apps/${app}/graph.json`,
		);

		const graphData = await readFile(graphPath, 'utf-8');
		const graph = JSON.parse(graphData);

		const response = {
			metadata: {
				source: 'graphify',
				type: 'semantic-knowledge-graph',
				scope: 'app',
				app,
				generated:
					graph.metadata?.generated || new Date().toISOString(),
			},
			graph,
		};

		return new Response(JSON.stringify(response), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=3600',
				'X-Graph-Type': 'graphify-semantic',
				'X-Graph-Scope': app,
			},
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				metadata: {
					source: 'graphify',
					type: 'semantic-knowledge-graph',
					scope: 'app',
					app,
					status: 'not-generated',
					message: `Graph not yet generated for app: ${app}. Run: pnpm nx run graphify-wrapper:build-app --app=${app}`,
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

export function getStaticPaths() {
	// Define available apps for static generation
	// This list should match your actual apps
	const apps = [
		'herbmail',
		'laser',
		'discordsh',
		'cryptothrone',
		'chuckrpg',
		'memes',
		'rareicon',
		'irc',
		'jobboard',
		'metrics',
		'rows',
	];

	return apps.map((app) => ({
		params: { app },
	}));
}
