/**
 * CI Registry — Source of truth for all tracked monorepo apps and packages.
 *
 * This data is validated at import time by the Zod schemas generated from
 * kbve/ci_registry.proto. Adding a new tracked item = adding an entry here.
 *
 * The generated schema is produced at packages/data/codegen/generated/ci_registry-schema.ts
 * and copied into this directory as ci_registry-schema.ts.
 */

import {
	CiProjectSchema,
	type CiProject,
	type DispatchPipelineValue,
} from './ci_registry-schema.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Registry data — validated at import time
// ---------------------------------------------------------------------------

const ProjectArraySchema = z.array(CiProjectSchema);

export const CI_PROJECTS: CiProject[] = ProjectArraySchema.parse([
	// ── Docker Apps ─────────────────────────────────────────────
	{
		key: 'astro_kbve',
		name: 'Axum KBVE',
		pipeline: 'docker',
		app_name: 'axum-kbve',
		description: 'Main KBVE website (Astro + Axum)',
		source_path: 'apps/kbve/astro-kbve',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		tags: ['docker', 'web'],
	},
	{
		key: 'herbmail',
		name: 'Herbmail',
		pipeline: 'docker',
		app_name: 'herbmail',
		description: 'Herbmail email service',
		source_path: 'apps/herbmail',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		tags: ['docker', 'web'],
	},
	{
		key: 'memes',
		name: 'Memes',
		pipeline: 'docker',
		app_name: 'memes',
		description: 'Memes app',
		source_path: 'apps/memes',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		tags: ['docker', 'web'],
	},
	{
		key: 'irc_gateway',
		name: 'IRC Gateway',
		pipeline: 'docker',
		app_name: 'irc-gateway',
		description: 'IRC gateway service',
		source_path: 'apps/irc',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		tags: ['docker', 'networking'],
	},
	{
		key: 'discordsh',
		name: 'DiscordSH',
		pipeline: 'docker',
		app_name: 'discordsh',
		description: 'Discord server topsite',
		source_path: 'apps/discordsh',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		tags: ['docker', 'discord'],
	},
	{
		key: 'mc',
		name: 'Minecraft Server',
		pipeline: 'docker',
		app_name: 'mc',
		description: 'Pumpkin Minecraft server',
		source_path: 'apps/mc',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		tags: ['docker', 'gaming'],
	},
	{
		key: 'edge',
		name: 'Edge Functions',
		pipeline: 'docker',
		app_name: 'edge',
		description: 'Supabase edge functions',
		source_path: 'apps/kbve/edge',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		tags: ['docker', 'serverless'],
	},
	{
		key: 'cryptothrone',
		name: 'CryptoThrone',
		pipeline: 'docker',
		app_name: 'cryptothrone',
		description: 'King of the Hill game',
		source_path: 'apps/cryptothrone',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		tags: ['docker', 'gaming'],
	},
	{
		key: 'kilobase',
		name: 'Kilobase',
		pipeline: 'docker',
		app_name: 'kilobase',
		description: 'Kilobase database service',
		source_path: 'apps/kbve/kilobase',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		tags: ['docker', 'database'],
	},

	// ── NPM Packages ───────────────────────────────────────────
	{
		key: 'droid',
		name: 'Droid',
		pipeline: 'npm',
		package_name: 'droid',
		description: 'Core utility package for KBVE automation',
		source_path: 'packages/npm/droid',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['npm'],
	},
	{
		key: 'laser',
		name: 'Laser',
		pipeline: 'npm',
		package_name: 'laser',
		description: 'Laser utility package',
		source_path: 'packages/npm/laser',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['npm'],
	},
	{
		key: 'devops',
		name: 'DevOps',
		pipeline: 'npm',
		package_name: 'devops',
		description: 'DevOps utilities and proto-to-zod codegen',
		source_path: 'packages/npm/devops',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['npm', 'devops'],
	},
	{
		key: 'khashvault',
		name: 'KhashVault',
		pipeline: 'npm',
		package_name: 'khashvault',
		description: 'KhashVault package',
		source_path: 'packages/npm/khashvault',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['npm'],
	},

	// ── Rust Crates ────────────────────────────────────────────
	{
		key: 'q_crate',
		name: 'Q',
		pipeline: 'crates',
		package_name: 'q',
		description: 'Q utility crate',
		source_path: 'packages/rust/q',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['crates', 'rust'],
	},
	{
		key: 'jedi_crate',
		name: 'Jedi',
		pipeline: 'crates',
		package_name: 'jedi',
		description: 'Jedi crate',
		source_path: 'packages/rust/jedi',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['crates', 'rust'],
	},
	{
		key: 'soul_crate',
		name: 'Soul',
		pipeline: 'crates',
		package_name: 'soul',
		description: 'Soul crate',
		source_path: 'packages/rust/soul',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['crates', 'rust'],
	},
	{
		key: 'kbve_crate',
		name: 'KBVE',
		pipeline: 'crates',
		package_name: 'kbve',
		description: 'KBVE core crate',
		source_path: 'packages/rust/kbve',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['crates', 'rust'],
	},
	{
		key: 'erust_crate',
		name: 'ERust',
		pipeline: 'crates',
		package_name: 'erust',
		description: 'ERust crate',
		source_path: 'packages/rust/erust',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['crates', 'rust'],
	},
	{
		key: 'holy_crate',
		name: 'Holy',
		pipeline: 'crates',
		package_name: 'holy',
		description: 'Holy crate',
		source_path: 'packages/rust/holy',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['crates', 'rust'],
	},

	// ── Python Packages ────────────────────────────────────────
	{
		key: 'py_lib_fudster',
		name: 'Fudster',
		pipeline: 'python',
		package_name: 'python-fudster',
		pypi_name: 'fudster',
		description: 'Fudster Python library',
		source_path: 'packages/python/fudster',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['python'],
	},
	{
		key: 'py_lib_kbve',
		name: 'Python KBVE',
		pipeline: 'python',
		package_name: 'python-kbve',
		pypi_name: 'kbve',
		description: 'KBVE Python library',
		source_path: 'packages/python/kbve',
		author: 'h0lybyte',
		license: 'MIT',
		status: 'active',
		tags: ['python'],
	},

	// ── Unreal Plugins ─────────────────────────────────────────
	{
		key: 'ue_kbvexxhash',
		name: 'KBVEXXHash',
		pipeline: 'unreal',
		plugin_name: 'KBVEXXHash',
		plugin_path: 'packages/unreal/KBVEXXHash',
		description: 'XXHash plugin for Unreal Engine',
		source_path: 'packages/unreal/KBVEXXHash',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		min_engine_version: '5.4',
		supported_platforms: ['Win64', 'Linux', 'Mac'],
		tags: ['unreal', 'hashing'],
	},
	{
		key: 'ue_kbveyyjson',
		name: 'KBVEYYJson',
		pipeline: 'unreal',
		plugin_name: 'KBVEYYJson',
		plugin_path: 'packages/unreal/KBVEYYJson',
		description: 'YYJson serialization plugin for Unreal Engine',
		source_path: 'packages/unreal/KBVEYYJson',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		min_engine_version: '5.4',
		supported_platforms: ['Win64', 'Linux', 'Mac'],
		tags: ['unreal', 'json'],
	},
	{
		key: 'ue_kbvezstd',
		name: 'KBVEZstd',
		pipeline: 'unreal',
		plugin_name: 'KBVEZstd',
		plugin_path: 'packages/unreal/KBVEZstd',
		description: 'Zstandard compression plugin for Unreal Engine',
		source_path: 'packages/unreal/KBVEZstd',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		min_engine_version: '5.4',
		supported_platforms: ['Win64', 'Linux', 'Mac'],
		tags: ['unreal', 'compression'],
	},
	{
		key: 'ue_kbvesqlite',
		name: 'KBVESQLite',
		pipeline: 'unreal',
		plugin_name: 'KBVESQLite',
		plugin_path: 'packages/unreal/KBVESQLite',
		description: 'SQLite plugin for Unreal Engine',
		source_path: 'packages/unreal/KBVESQLite',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		min_engine_version: '5.4',
		supported_platforms: ['Win64', 'Linux', 'Mac'],
		tags: ['unreal', 'database'],
	},
	{
		key: 'ue_kbvewasm',
		name: 'KBVEWASM',
		pipeline: 'unreal',
		plugin_name: 'KBVEWASM',
		plugin_path: 'packages/unreal/KBVEWASM',
		description: 'WebAssembly runtime plugin for Unreal Engine',
		source_path: 'packages/unreal/KBVEWASM',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		min_engine_version: '5.4',
		supported_platforms: ['Win64', 'Linux', 'Mac'],
		tags: ['unreal', 'wasm'],
	},
	{
		key: 'ue_devops',
		name: 'UEDevOps',
		pipeline: 'unreal',
		plugin_name: 'UEDevOps',
		plugin_path: 'packages/unreal/UEDevOps',
		dependency_plugins:
			'packages/unreal/KBVEYYJson packages/unreal/KBVEXXHash packages/unreal/KBVEZstd',
		itch_game_id: 'uedevops',
		description: 'DevOps toolkit plugin for Unreal Engine',
		source_path: 'packages/unreal/UEDevOps',
		author: 'h0lybyte',
		license: 'KBVE',
		status: 'active',
		min_engine_version: '5.4',
		supported_platforms: ['Win64', 'Linux', 'Mac'],
		tags: ['unreal', 'devops'],
	},
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Filter projects by pipeline type. */
export function getProjectsByPipeline(
	pipeline: DispatchPipelineValue,
): CiProject[] {
	return CI_PROJECTS.filter((p) => p.pipeline === pipeline);
}

/** Look up a project by its alteration key. */
export function getProjectByKey(key: string): CiProject | undefined {
	return CI_PROJECTS.find((p) => p.key === key);
}

/** Get summary counts per pipeline. */
export function getRegistrySummary(): Record<string, number> {
	const summary: Record<string, number> = {};
	for (const p of CI_PROJECTS) {
		summary[p.pipeline] = (summary[p.pipeline] || 0) + 1;
	}
	summary['total'] = CI_PROJECTS.length;
	return summary;
}
