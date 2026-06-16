#!/usr/bin/env node
/**
 * Jobboard taxonomy codegen — MDX is the single source of truth.
 *
 * Reads the `verticals` block in:
 *   apps/kbve/astro-kbve/src/content/docs/project/jobboard.mdx
 *
 * Emits:
 *   packages/data/codegen/generated/jobboard-taxonomy.json   (canonical bundle)
 *   apps/jobboard/web/src/api/taxonomy.generated.json        (SPA imports this)
 *   packages/data/codegen/generated/jobboard-taxonomy-seed.sql (idempotent upsert)
 *   apps/jobboard/docker/seed.sql                            (local compose seed)
 *
 * slug/name = stable locale-independent keys; label = display (en). i18n later
 * layers a labels map without reshaping. Re-run after editing the MDX:
 *   nx run astro-kbve:sync:jobboard-taxonomy
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const MDX = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/project/jobboard.mdx',
);
const GEN_DIR = resolve(__dirname, 'generated');
const BUNDLE = resolve(GEN_DIR, 'jobboard-taxonomy.json');
const SEED = resolve(GEN_DIR, 'jobboard-taxonomy-seed.sql');
const WEB_JSON = resolve(
	repoRoot,
	'apps/jobboard/web/src/api/taxonomy.generated.json',
);
const DOCKER_SEED = resolve(repoRoot, 'apps/jobboard/docker/seed.sql');

const STATUS = { inactive: 0, active: 1, featured: 2 };
const KINDS = [
	['disciplines', 1],
	['tools', 2],
	['skills', 3],
];

const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;

function build() {
	const { data } = matter(readFileSync(MDX, 'utf8'));
	const src = Array.isArray(data.verticals) ? data.verticals : [];

	const verticals = [];
	const taxonomy = [];
	let vid = 0;
	let tid = 0;

	for (const v of src) {
		vid += 1;
		verticals.push({
			id: vid,
			slug: v.slug,
			label: v.label,
			description: v.description ?? '',
			status: STATUS[v.status ?? 'active'] ?? 1,
			sort_order: v.sort_order ?? 0,
		});
		for (const [field, kind] of KINDS) {
			for (const row of v[field] ?? []) {
				const [name, label] = row;
				tid += 1;
				taxonomy.push({
					id: tid,
					vertical_id: vid,
					vertical_slug: v.slug,
					kind,
					name,
					label,
					status: 1,
				});
			}
		}
	}
	return { verticals, taxonomy };
}

function seedSql({ verticals, taxonomy }) {
	const L = [
		'-- AUTO-GENERATED — do not edit. Source of truth:',
		'--   apps/kbve/astro-kbve/src/content/docs/project/jobboard.mdx (verticals block)',
		'-- Regenerate: nx run astro-kbve:sync:jobboard-taxonomy',
		'',
		'insert into jobboard.verticals (slug, label, description, status, sort_order) values',
	];
	L.push(
		verticals
			.map(
				(v) =>
					`    (${sql(v.slug)}, ${sql(v.label)}, ${sql(v.description)}, ${v.status}, ${v.sort_order})`,
			)
			.join(',\n') + '',
	);
	L.push(
		'on conflict (slug) do update set',
		'    label = excluded.label, description = excluded.description,',
		'    status = excluded.status, sort_order = excluded.sort_order;',
		'',
		'insert into jobboard.taxonomy (vertical_id, kind, name, label, status)',
		'select v.id, t.kind, t.name, t.label, t.status',
		'from (values',
	);
	L.push(
		taxonomy
			.map(
				(t) =>
					`    (${sql(t.vertical_slug)}, ${t.kind}, ${sql(t.name)}, ${sql(t.label)}, ${t.status})`,
			)
			.join(',\n'),
	);
	L.push(
		') as t(vertical_slug, kind, name, label, status)',
		'join jobboard.verticals v on v.slug = t.vertical_slug',
		'on conflict (vertical_id, kind, name) do update set',
		'    label = excluded.label, status = excluded.status;',
		'',
	);
	return L.join('\n');
}

function writeFile(path, content) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
	console.log('wrote', path.replace(repoRoot + '/', ''));
}

const data = build();
if (!existsSync(GEN_DIR)) mkdirSync(GEN_DIR, { recursive: true });
const bundle = JSON.stringify(data, null, 2) + '\n';
writeFile(BUNDLE, bundle);
writeFile(WEB_JSON, bundle);
const seed = seedSql(data);
writeFile(SEED, seed);
writeFile(DOCKER_SEED, seed);
console.log(
	`${data.verticals.length} verticals, ${data.taxonomy.length} taxonomy items`,
);
