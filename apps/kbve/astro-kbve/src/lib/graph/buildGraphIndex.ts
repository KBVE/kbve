/**
 * Fuses the three monorepo graph feeds — NX project dependencies, the Graphify
 * semantic directory graph, and the Starlight docs site graph — into a single
 * project-centric index consumed by the `/graph/` hub.
 *
 * Pure and IO-free: the endpoint reads the raw sources (static JSON +
 * `buildSiteGraph(getCollection('docs'))`) and hands them here. The spine is
 * the filesystem path — an NX project's `root` joins to its containing Graphify
 * directory bubble, and docs attach to projects by a best-effort name/slug
 * heuristic. Nodes present in only one feed survive as standalone searchable
 * entities so nothing is lost.
 */

export type NxProjectType = 'app' | 'lib' | 'e2e';

export interface NxGraphInput {
	graph: {
		nodes: Record<
			string,
			{ name?: string; type?: string; data?: { root?: string } }
		>;
		dependencies: Record<string, Array<{ target: string }>>;
	};
}

export interface GraphifyOverviewInput {
	dirs: Array<{ id: string; label: string }>;
}

export interface SiteGraphNodeInput {
	title: string;
	links?: string[];
	backlinks?: string[];
}

export type SiteGraphInput = Record<string, SiteGraphNodeInput>;

export interface GraphSources {
	nx?: NxGraphInput | null;
	graphify?: GraphifyOverviewInput | null;
	site?: SiteGraphInput | null;
}

export interface DocRef {
	slug: string;
	title: string;
}

export type EntityKind = 'project' | 'dir' | 'doc';

export interface GraphEntity {
	id: string;
	kind: EntityKind;
	name: string;
	root?: string;
	type?: NxProjectType;
	nx?: { deps: string[]; dependents: string[] };
	graphify?: { dirId: string; label: string };
	docs?: DocRef[];
}

export interface GraphIndex {
	entities: GraphEntity[];
	meta: {
		counts: {
			projects: number;
			dirs: number;
			docLinks: number;
			orphanDocs: number;
			total: number;
		};
		gaps: string[];
	};
}

const normType = (t: string | undefined): NxProjectType | undefined =>
	t === 'app' || t === 'lib' || t === 'e2e' ? t : undefined;

const topTwo = (root: string): string => root.split('/').slice(0, 2).join('/');

/** Slug segments lowercased, for name/path doc→project matching. */
const slugTokens = (slug: string): string[] =>
	slug.toLowerCase().split(/[\/#]/).filter(Boolean);

/**
 * Only "distinctive" project names are used to claim docs: hyphenated names
 * (`axum-kbve`, `arc-runner`) or names ≥6 chars (`kilobase`, `jobboard`) are
 * unambiguous identifiers. Short common words (`astro`, `core`, `chat`, `edge`)
 * collide with generic doc slugs and would vacuum up unrelated pages.
 */
const isDistinctive = (name: string): boolean =>
	name.includes('-') || name.length >= 6;

export function buildGraphIndex(sources: GraphSources): GraphIndex {
	const gaps: string[] = [];
	const nx = sources.nx ?? null;
	const graphify = sources.graphify ?? null;
	const site = sources.site ?? null;

	if (!nx || !Object.keys(nx.graph?.nodes ?? {}).length) gaps.push('nx');
	if (!graphify || !graphify.dirs?.length) gaps.push('graphify');
	if (!site || !Object.keys(site ?? {}).length) gaps.push('site');

	// Graphify dir lookup by label (exact) — one bubble per top-ish directory.
	const dirByLabel = new Map<string, { id: string; label: string }>();
	for (const d of graphify?.dirs ?? []) dirByLabel.set(d.label, d);
	const usedDirLabels = new Set<string>();

	// Reverse dependency map (dependents) from the forward edges.
	const nodes = nx?.graph?.nodes ?? {};
	const deps = nx?.graph?.dependencies ?? {};
	const dependents = new Map<string, Set<string>>();
	for (const [src, edges] of Object.entries(deps)) {
		for (const e of edges ?? []) {
			if (!dependents.has(e.target)) dependents.set(e.target, new Set());
			dependents.get(e.target)!.add(src);
		}
	}

	// Project entities, keyed by name; index by lowercased name for doc match.
	const projects: GraphEntity[] = [];
	const projectByToken = new Map<string, GraphEntity>();
	for (const [name, node] of Object.entries(nodes)) {
		const root = node.data?.root;
		const ent: GraphEntity = {
			id: name,
			kind: 'project',
			name,
			root,
			type: normType(node.type),
			nx: {
				deps: (deps[name] ?? []).map((e) => e.target).sort(),
				dependents: [...(dependents.get(name) ?? [])].sort(),
			},
			docs: [],
		};
		if (root) {
			const dir = dirByLabel.get(root) ?? dirByLabel.get(topTwo(root));
			if (dir) {
				ent.graphify = { dirId: dir.id, label: dir.label };
				usedDirLabels.add(dir.label);
			}
		}
		projects.push(ent);
		if (isDistinctive(name)) projectByToken.set(name.toLowerCase(), ent);
	}

	// Docs attach to a project by best-effort name/slug match. Unmatched docs
	// (most of the docs corpus — guides, journal, generic pages) are NOT emitted
	// as graph nodes: this is a code graph, and the docs site search already
	// covers browsing. We only surface the docs that link into the graph, and
	// count the rest as coverage metadata.
	let docLinks = 0;
	let orphanDocs = 0;
	for (const [slug, node] of Object.entries(site ?? {})) {
		const ref: DocRef = { slug, title: node.title || slug };
		const tokens = slugTokens(slug);
		let matched: GraphEntity | undefined;
		for (const tok of tokens) {
			const hit = projectByToken.get(tok);
			if (hit) {
				matched = hit;
				break;
			}
		}
		if (matched) {
			matched.docs!.push(ref);
			docLinks++;
		} else {
			orphanDocs++;
		}
	}

	// Orphan Graphify dirs — directories no project claimed (e.g. .github,
	// scripts) — kept as standalone searchable entities.
	const dirEntities: GraphEntity[] = [];
	for (const d of graphify?.dirs ?? []) {
		if (usedDirLabels.has(d.label)) continue;
		dirEntities.push({
			id: `dir:${d.id}`,
			kind: 'dir',
			name: d.label,
			graphify: { dirId: d.id, label: d.label },
		});
	}

	for (const p of projects) if (!p.docs!.length) delete p.docs;

	const entities = [...projects, ...dirEntities];
	return {
		entities,
		meta: {
			counts: {
				projects: projects.length,
				dirs: dirEntities.length,
				docLinks,
				orphanDocs,
				total: entities.length,
			},
			gaps,
		},
	};
}
