#!/usr/bin/env node
import { readFileSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const NPCDB_JSON = join(
	REPO_ROOT,
	'packages/data/codegen/generated/npcdb-data.json',
);
const ASTRO_PUBLIC = join(REPO_ROOT, 'apps/kbve/astro-kbve/public');
const MOD_ROOT = join(REPO_ROOT, 'apps/agones/factorio/mods-local/kbve');
const PORTRAIT_OUT = join(MOD_ROOT, 'graphics/portraits');
const LUA_OUT = join(MOD_ROOT, 'modules/npcs.lua');

const TAG = 'kbve-factorio';

const FAMILY_VAR = (ref) => ref.toUpperCase().replace(/-/g, '_');

const luaEscape = (s) =>
	String(s)
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '');

const data = JSON.parse(readFileSync(NPCDB_JSON, 'utf8'));
const npcs = (data.npcs || []).filter((n) => (n.tags || []).includes(TAG));
if (!npcs.length) {
	console.error(`no npcs tagged "${TAG}" in ${NPCDB_JSON}`);
	process.exit(1);
}

mkdirSync(PORTRAIT_OUT, { recursive: true });
const copies = [];
for (const npc of npcs) {
	if (!npc.img) continue;
	const src = join(ASTRO_PUBLIC, npc.img.replace(/^\//, ''));
	const dst = join(PORTRAIT_OUT, `${npc.ref}.png`);
	copyFileSync(src, dst);
	copies.push(`${npc.ref}.png`);
}

const lines = [];
lines.push('local Npcs = {}');
lines.push('');
lines.push('local function pick_line(pool, seed)');
lines.push('\tif not pool or #pool == 0 then return \'\' end');
lines.push('\tlocal idx = ((seed or game.tick) % #pool) + 1');
lines.push('\treturn pool[idx]');
lines.push('end');
lines.push('');

const exported = [];
for (const npc of npcs) {
	const v = FAMILY_VAR(npc.ref);
	exported.push({ npc, v });
	lines.push(`local ${v} = {`);
	lines.push(`\tid = '${luaEscape(npc.ref)}',`);
	lines.push(`\tname = '${luaEscape(npc.name)}',`);
	lines.push(`\trole = '${luaEscape(npc.role || npc.title || npc.name)}',`);
	lines.push(`\tportrait = 'kbve_portrait_${npc.ref}',`);
	for (const dlg of npc.dialogue || []) {
		const pool = (dlg.lines || []).map((l) => `'${luaEscape(l)}'`).join(', ');
		const key = `${dlg.trigger}_lines`;
		lines.push(`\t${key} = { ${pool} },`);
	}
	lines.push('}');
	lines.push('');
}

for (const { npc, v } of exported) {
	lines.push(`Npcs.${v} = ${v}`);
}
lines.push('');

const triggers = new Set();
for (const npc of npcs) {
	for (const dlg of npc.dialogue || []) triggers.add(dlg.trigger);
}
for (const trig of triggers) {
	lines.push(`function Npcs.${trig}(npc, seed)`);
	lines.push(`\treturn pick_line(npc.${trig}_lines, seed)`);
	lines.push('end');
	lines.push('');
}

lines.push('return Npcs');
lines.push('');
writeFileSync(LUA_OUT, lines.join('\n'));

console.log(
	`synced ${npcs.length} factorio npc(s): portraits=${copies.length} lua=${LUA_OUT}`,
);
