import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const OUT = process.argv[3];
const DIR = join(ROOT, 'node_modules/lucide/dist/esm/icons');

// key -> lucide icon file slug
const WANTED = {
	// actions / chrome
	play: 'play',
	close: 'x',
	back: 'arrow-left',
	forward: 'arrow-right',
	external: 'external-link',
	chevronRight: 'chevron-right',
	// status
	check: 'circle-check-big',
	error: 'circle-x',
	warn: 'circle-alert',
	loader: 'loader-circle',
	// identity
	user: 'user',
	users: 'users',
	shield: 'shield-alert',
	// surfaces
	dashboard: 'layout-dashboard',
	activity: 'activity',
	layers: 'layers',
	tag: 'tag',
	factory: 'factory',
	cast: 'cast',
	kanban: 'kanban',
	report: 'file-text',
	graph: 'network',
	settings: 'settings',
	bell: 'bell',
	star: 'star',
	clock: 'clock',
	calendar: 'calendar',
	gem: 'gem',
	// infra
	chart: 'chart-column',
	database: 'database',
	server: 'server',
	zap: 'zap',
	cube: 'box',
	gitBranch: 'git-branch',
	gitFork: 'git-fork',
	workflow: 'workflow',
	code: 'code',
	bot: 'bot',
	cloud: 'cloud',
	archive: 'archive',
	hardDrive: 'hard-drive',
	terminal: 'terminal',
	// game / store
	gamepad: 'gamepad-2',
	pickaxe: 'pickaxe',
	cart: 'shopping-cart',
	bag: 'shopping-bag',
	sparkles: 'sparkles',
	compass: 'compass',
};

function parse(slug) {
	const file = join(DIR, `${slug}.js`);
	if (!existsSync(file)) throw new Error(`missing lucide icon: ${slug}`);
	const src = readFileSync(file, 'utf8');
	const open = src.indexOf('= [');
	if (open < 0) throw new Error(`unparsable: ${slug}`);
	let depth = 0;
	let close = -1;
	for (let i = open + 2; i < src.length; i++) {
		if (src[i] === '[') depth++;
		else if (src[i] === ']' && --depth === 0) {
			close = i;
			break;
		}
	}
	if (close < 0) throw new Error(`unbalanced: ${slug}`);
	const body = src.slice(open + 2, close + 1);
	// icon bodies are literal JS arrays of [tag, attrs] with unquoted keys
	const nodes = new Function(`return ${body}`)();
	return nodes.map(([tag, attrs]) => [tag, attrs]);
}

const entries = Object.entries(WANTED)
	.sort(([a], [b]) => a.localeCompare(b))
	.map(([key, slug]) => {
		const nodes = parse(slug);
		const body = nodes
			.map(([tag, attrs]) => {
				const pairs = Object.entries(attrs)
					.map(([k, v]) => {
						const s = String(v);
						if (s.includes("'")) throw new Error(`quote in ${tag}.${k}`);
						return `${k}: '${s}'`;
					})
					.join(', ');
				return `\t\t['${tag}', { ${pairs} }],`;
			})
			.join('\n');
		return `\t// ${slug}\n\t${key}: [\n${body}\n\t],`;
	})
	.join('\n');

const out = `// Generated from lucide v0.575.0 (ISC). Do not edit by hand.
// Regenerate: node packages/npm/rn/tools/gen-icons.mjs

export type IconNode = readonly (readonly [
	tag: string,
	attrs: Readonly<Record<string, string>>,
])[];

export const ICONS = {
${entries}
} as const satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** Shared 24x24 stroke geometry both the RN <Icon> and the web <Icon> assume. */
export const ICON_VIEWBOX = '0 0 24 24';
export const ICON_STROKE_WIDTH = 2;
`;

writeFileSync(OUT, out);
console.log(`wrote ${Object.keys(WANTED).length} icons -> ${OUT}`);
