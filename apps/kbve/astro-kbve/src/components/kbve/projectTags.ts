export type ProjectCategory = 'game' | 'library' | 'service' | 'tool';

export interface CategoryDef {
	key: ProjectCategory;
	label: string;
	tags: string[];
}

export const CATEGORY_DEFS: CategoryDef[] = [
	{
		key: 'game',
		label: 'Games',
		tags: [
			'game',
			'gamedev',
			'gaming',
			'gameplay',
			'unreal',
			'ue5',
			'bevy',
			'unity',
			'godot',
			'phaser',
			'arpg',
			'multiplayer',
			'game-server',
			'gameserver',
			'game-client',
		],
	},
	{
		key: 'library',
		label: 'Libraries',
		tags: [
			'crates',
			'npm',
			'python',
			'rust',
			'typescript',
			'node',
			'react',
			'proto',
			'wasm',
			'ffi',
		],
	},
	{
		key: 'service',
		label: 'Services',
		tags: [
			'docker',
			'agones',
			'kubernetes',
			'server',
			'infrastructure',
			'api',
			'backend',
			'database',
			'observability',
			'telemetry',
			'devops',
			'firecracker',
			'kubevirt',
			'networking',
		],
	},
	{
		key: 'tool',
		label: 'Tools',
		tags: [
			'tool',
			'utility',
			'cli',
			'editor',
			'git',
			'workers',
			'bot',
			'ows',
		],
	},
];

const CATEGORY_LOOKUP: Map<string, ProjectCategory> = new Map();
for (const def of CATEGORY_DEFS) {
	for (const t of def.tags) CATEGORY_LOOKUP.set(t, def.key);
}

export interface DeriveInput {
	tags?: string[];
	pipeline?: string;
	hasPackage?: boolean;
}

export function deriveCategories(input: DeriveInput): ProjectCategory[] {
	const tags = (input.tags ?? []).map((t) => t.toLowerCase());
	const set = new Set<ProjectCategory>();
	for (const t of tags) {
		const cat = CATEGORY_LOOKUP.get(t);
		if (!cat) continue;
		if (cat === 'library' && !input.hasPackage) continue;
		set.add(cat);
	}
	return [...set];
}

export const LANGUAGE_TAGS: string[] = [
	'rust',
	'python',
	'typescript',
	'javascript',
	'unreal',
	'bevy',
	'unity',
	'godot',
	'phaser',
	'docker',
	'astro',
	'supabase',
	'agones',
	'kubernetes',
	'wasm',
	'react',
	'proto',
	'axum',
];

const LANGUAGE_SET = new Set(LANGUAGE_TAGS);

export const LANGUAGE_LABELS: Record<string, string> = {
	rust: 'Rust',
	python: 'Python',
	typescript: 'TypeScript',
	javascript: 'JavaScript',
	unreal: 'Unreal',
	bevy: 'Bevy',
	unity: 'Unity',
	godot: 'Godot',
	phaser: 'Phaser',
	docker: 'Docker',
	astro: 'Astro',
	supabase: 'Supabase',
	agones: 'Agones',
	kubernetes: 'Kubernetes',
	wasm: 'WASM',
	react: 'React',
	proto: 'Proto',
	axum: 'axum',
};

export function deriveLanguages(tags?: string[]): string[] {
	const seen = new Set<string>();
	for (const t of tags ?? []) {
		const lower = t.toLowerCase();
		if (LANGUAGE_SET.has(lower)) seen.add(lower);
	}
	return [...seen];
}

export type Registry = 'npm' | 'crates' | 'python';

export const REGISTRY_LABELS: Record<Registry, string> = {
	npm: 'NPM',
	crates: 'Crates',
	python: 'pip',
};

export function pipelineToRegistry(pipeline?: string): Registry | null {
	if (pipeline === 'crates' || pipeline === 'npm' || pipeline === 'python')
		return pipeline;
	return null;
}
