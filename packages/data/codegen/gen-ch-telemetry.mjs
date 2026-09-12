#!/usr/bin/env node
/**
 * telemetry schema fan-out — packages/data/ch/schemas/telemetry.sql is the only
 * place the telemetry DDL is written by hand. Two other artifacts have to say
 * the same thing, and both used to be maintained by hand alongside it:
 *
 *   apps/kube/metrics/manifest/telemetry-ch-setup-job.yaml  what prod applies
 *   services/metrics/e2e/init/01-telemetry.sql              what e2e applies
 *
 * They drifted, silently and immediately: the perf and product lenses landed in
 * the canonical file and the prod job, and the e2e schema stayed on errors
 * alone -- so the harness would have gone green while never touching two thirds
 * of the pipeline.
 *
 * Usage:
 *   node packages/data/codegen/gen-ch-telemetry.mjs           # write
 *   node packages/data/codegen/gen-ch-telemetry.mjs --check   # CI drift gate
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE = 'packages/data/ch/schemas/telemetry.sql';
const SETUP_JOB = 'apps/kube/metrics/manifest/telemetry-ch-setup-job.yaml';
const E2E_INIT = 'services/metrics/e2e/init/01-telemetry.sql';

const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');

/** Split on semicolons that sit outside quotes, dropping `--` comment lines. */
function statements(sql) {
	const bare = sql
		.split('\n')
		.filter((l) => !l.trimStart().startsWith('--'))
		.join('\n');
	const out = [];
	let buf = '';
	let quoted = false;
	for (const ch of bare) {
		if (ch === "'") quoted = !quoted;
		if (ch === ';' && !quoted) {
			if (buf.trim()) out.push(buf.trim());
			buf = '';
			continue;
		}
		buf += ch;
	}
	if (buf.trim()) out.push(buf.trim());
	return out;
}

/** Split a column list on commas at paren depth 0 -- `DateTime64(3, 'UTC')` has one inside. */
function topLevelParts(body) {
	const parts = [];
	let depth = 0;
	let buf = '';
	for (const ch of body) {
		if (ch === '(') depth++;
		if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			parts.push(buf.trim());
			buf = '';
			continue;
		}
		buf += ch;
	}
	if (buf.trim()) parts.push(buf.trim());
	return parts;
}

function parse(sql) {
	const db = [];
	const raw = [];
	const distributed = [];
	const views = [];

	for (const stmt of statements(sql)) {
		if (/^CREATE DATABASE/i.test(stmt)) {
			db.push(stmt);
			continue;
		}
		if (/^CREATE VIEW/i.test(stmt)) {
			const name = stmt.match(/CREATE VIEW IF NOT EXISTS telemetry\.(\w+)/i)[1];
			views.push({ name, stmt });
			continue;
		}
		const dist = stmt.match(
			/CREATE TABLE IF NOT EXISTS telemetry\.(\w+) ON CLUSTER 'cluster'\s*AS telemetry\.(\w+)\s*ENGINE = (Distributed\([^)]*\))/i,
		);
		if (dist) {
			distributed.push({ name: dist[1], source: dist[2], stmt });
			continue;
		}
		const m = stmt.match(
			/CREATE TABLE IF NOT EXISTS telemetry\.(\w+) ON CLUSTER 'cluster'\s*\(([\s\S]*)\)\s*ENGINE = ReplicatedMergeTree\('([^']+)', '\{replica\}'\)\s*([\s\S]*)$/i,
		);
		if (!m) throw new Error(`unrecognized statement in ${SOURCE}:\n${stmt}`);
		const [, name, body, zkPath, trailer] = m;
		const parts = topLevelParts(body);
		const columns = parts.filter((p) => !/^CONSTRAINT/i.test(p));
		const constraints = parts
			.filter((p) => /^CONSTRAINT/i.test(p))
			.map((p) => p.replace(/^CONSTRAINT\s+/i, '').replace(/\s+/g, ' '));
		const ttl = trailer.match(/TTL\s+([\s\S]+)$/i)?.[1].trim();
		const clauses = trailer
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
		raw.push({ name, columns, constraints, ttl, clauses, zkPath });
	}
	return { db, raw, distributed, views };
}

// ---------------------------------------------------------------------------
// prod: the ConfigMap script the PreSync hook runs
// ---------------------------------------------------------------------------

const CURL = `curl -sf --max-time 30 \\
  "\${CLICKHOUSE_ENDPOINT}/?user=\${CLICKHOUSE_USER}&password=\${CLICKHOUSE_PASSWORD}" \\`;

function step(label, sql, errLabel, okLabel) {
	return `echo "${label}"
${CURL}
  -d "${sql}" || {
  echo "ERROR: ${errLabel}"
  exit 1
}
echo "${okLabel}"
`;
}

function setupScript(schema) {
	const chunks = [];
	chunks.push(`#!/bin/sh
set -eu

echo "Verifying ClickHouse connectivity..."
curl -sf --max-time 10 \\
  "\${CLICKHOUSE_ENDPOINT}/?user=\${CLICKHOUSE_USER}&password=\${CLICKHOUSE_PASSWORD}" \\
  -d "SELECT 1" >/dev/null || {
  echo "ERROR: Cannot connect to ClickHouse at \${CLICKHOUSE_ENDPOINT}"
  exit 1
}
echo "ClickHouse connection OK."
`);

	for (const stmt of schema.db) {
		chunks.push(
			step(
				'Creating telemetry database...',
				stmt,
				'Failed to create telemetry database',
				"Database 'telemetry' ready.",
			),
		);
	}

	for (const t of schema.raw) {
		// Constraints are added by ALTER rather than inlined here: CREATE ... IF
		// NOT EXISTS is a no-op against a table that already exists, so a
		// constraint added to the canonical file would never reach a cluster that
		// had already run this job once. Same reason for MODIFY TTL.
		const create = `\nCREATE TABLE IF NOT EXISTS telemetry.${t.name} ON CLUSTER 'cluster'\n(\n${t.columns
			.map((c) => `    ${c}`)
			.join(',\n')}\n)\nENGINE = ReplicatedMergeTree('${t.zkPath}', '{replica}')\n${t.clauses.join('\n')}\n`;
		chunks.push(
			step(
				`Creating ${t.name} table (ReplicatedMergeTree, 30d TTL)...`,
				create,
				`Failed to create ${t.name} table`,
				`Table 'telemetry.${t.name}' ready.`,
			),
		);
		if (t.ttl) {
			chunks.push(
				step(
					`Enforcing TTL on ${t.name}...`,
					`ALTER TABLE telemetry.${t.name} ON CLUSTER 'cluster' MODIFY TTL ${t.ttl}`,
					`Failed to apply TTL to ${t.name}`,
					`TTL on 'telemetry.${t.name}' enforced.`,
				),
			);
		}
		if (t.constraints.length > 0) {
			chunks.push(`echo "Applying sanitization constraints on ${t.name}..."
for c in \\
${t.constraints.map((c) => `  "${c}"`).join(' \\\n')}; do
  curl -sf --max-time 30 \\
    "\${CLICKHOUSE_ENDPOINT}/?user=\${CLICKHOUSE_USER}&password=\${CLICKHOUSE_PASSWORD}" \\
    -d "ALTER TABLE telemetry.${t.name} ON CLUSTER 'cluster' ADD CONSTRAINT IF NOT EXISTS \${c}" || {
    echo "ERROR: Failed to add constraint: \${c}"
    exit 1
  }
done
echo "Constraints on 'telemetry.${t.name}' applied."
`);
		}
	}

	for (const d of schema.distributed) {
		chunks.push(
			step(
				`Creating ${d.name} table (Distributed)...`,
				`\n${d.stmt}\n`,
				`Failed to create ${d.name} table`,
				`Table 'telemetry.${d.name}' ready.`,
			),
		);
	}

	for (const v of schema.views) {
		chunks.push(
			step(
				`Creating ${v.name} view...`,
				`\n${v.stmt}\n`,
				`Failed to create ${v.name} view`,
				`View 'telemetry.${v.name}' ready.`,
			),
		);
	}

	chunks.push('echo ""\necho "Telemetry schema setup complete."\n');
	return chunks.join('\n');
}

// ---------------------------------------------------------------------------
// e2e: the same schema on a one-node ClickHouse
// ---------------------------------------------------------------------------

/**
 * A single node has no cluster and no replicas, so every `X_raw` +
 * `X_distributed` pair collapses into one plain MergeTree carrying the
 * distributed name -- which is the name the service is configured with, and so
 * the name the harness has to provide. Constraints are inlined rather than
 * ALTERed because the table is always created fresh here; keeping them means
 * e2e actually exercises the tripwires that sit above the app's own clamps.
 */
function e2eInit(schema) {
	const out = [
		`-- AUTO-GENERATED from ${SOURCE} by packages/data/codegen/gen-ch-telemetry.mjs`,
		'-- DO NOT EDIT -- regenerate with:',
		'--   node packages/data/codegen/gen-ch-telemetry.mjs',
		'--',
		'-- Single-node telemetry schema for the metrics e2e harness. Production is',
		"-- ReplicatedMergeTree + Distributed ON CLUSTER 'cluster'; a one-node CH has",
		'-- neither, so each raw/distributed pair collapses to one plain MergeTree',
		'-- under the distributed name the service queries.',
		'',
	];

	for (const stmt of schema.db) {
		out.push(`${stmt.replace(/ ON CLUSTER 'cluster'/i, '')};`, '');
	}

	const bySource = new Map(schema.distributed.map((d) => [d.source, d.name]));
	for (const t of schema.raw) {
		const name = bySource.get(t.name) ?? t.name;
		const cols = [...t.columns, ...t.constraints.map((c) => `CONSTRAINT ${c}`)];
		out.push(
			`CREATE TABLE IF NOT EXISTS telemetry.${name}`,
			'(',
			cols.map((c) => `    ${c}`).join(',\n'),
			')',
			'ENGINE = MergeTree',
			...t.clauses.slice(0, -1),
			`${t.clauses[t.clauses.length - 1]};`,
			'',
		);
	}

	for (const v of schema.views) {
		out.push(`${v.stmt.replace(/ ON CLUSTER 'cluster'/i, '')};`, '');
	}

	return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

// ---------------------------------------------------------------------------

/** Rewrite only the ConfigMap document's setup.sh, leaving the Job document alone. */
function renderSetupJob(current, script) {
	const marker = '    setup.sh: |\n';
	const head = current.slice(0, current.indexOf(marker) + marker.length);
	const rest = current.slice(current.indexOf('\n---\n'));
	const body = script
		.split('\n')
		.slice(0, -1)
		.map((l) => (l ? `        ${l}` : ''))
		.join('\n');
	return `${head}${body}\n${rest}`;
}

const schema = parse(read(SOURCE));
const targets = [
	[E2E_INIT, e2eInit(schema)],
	[SETUP_JOB, renderSetupJob(read(SETUP_JOB), setupScript(schema))],
];

const check = process.argv.includes('--check');
let stale = 0;
for (const [path, content] of targets) {
	if (read(path) === content) {
		if (!check) console.log(`  = ${path}`);
		continue;
	}
	stale++;
	if (check) {
		console.error(`  ✗ ${path} is stale`);
		continue;
	}
	writeFileSync(resolve(repoRoot, path), content);
	console.log(`  ✓ ${path}`);
}

if (check && stale > 0) {
	console.error(
		`\n${stale} telemetry artifact(s) do not match ${SOURCE}.\nRun: node packages/data/codegen/gen-ch-telemetry.mjs`,
	);
	process.exit(1);
}
console.log(
	check
		? `✓ telemetry artifacts match ${SOURCE}`
		: `\nGenerated ${targets.length} artifact(s) from ${SOURCE}`,
);
