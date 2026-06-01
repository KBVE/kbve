import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsSchema } from '@astrojs/starlight/schema';
import { docsLoader } from '@astrojs/starlight/loaders';
// TODO: Re-enable once starlight-site-graph supports Zod 4 / Astro 6
// import { pageSiteGraphSchema } from 'starlight-site-graph/schema';
import { glob } from 'astro/loaders';

import {
	IObjectSchema,
	IQuestSchema,
	IMapObjectSchema,
	INpcSchema,
	OSRSExtendedSchema,
	ICiProjectSchema,
	MCItemSchema,
	McEnchantSchema,
	McBlockSchema,
} from '@/data/schema';

const OSRSFrontmatterSchema = OSRSExtendedSchema;

export function validateItemUniqueness(items: z.infer<typeof IObjectSchema>[]) {
	const seenIds = new Set<string>();
	const seenKeys = new Set<number>();
	const seenRefs = new Set<string>();

	for (const item of items) {
		if (seenIds.has(item.id)) {
			throw new Error(`Duplicate id detected: ${item.id}`);
		}
		if (seenKeys.has(item.key)) {
			throw new Error(`Duplicate key detected: ${item.key}`);
		}
		if (seenRefs.has(item.ref)) {
			throw new Error(`Duplicate ref detected: ${item.ref}`);
		}
		seenIds.add(item.id);
		seenKeys.add(item.key);
		seenRefs.add(item.ref);
	}
}

const application = defineCollection({
	loader: glob({
		pattern: '**/*.mdx',
		base: './src/content/docs/application',
	}),
});

const gdd = defineCollection({
	loader: glob({
		pattern: '**/*.mdx',
		base: './src/content/docs/gdd',
	}),
});

const SteamAppInline = z.object({
	app_id: z.string().regex(/^\d+$/).max(16),
	label: z.string().min(1).max(64).optional(),
	depot_id: z.string().regex(/^\d+$/).max(16).optional(),
	branch: z.string().min(1).max(64).optional(),
	promote_to_branch: z.string().min(1).max(64).optional(),
});

const FactorioModInline = z.object({
	name: z
		.string()
		.min(1)
		.max(50)
		.regex(/^[a-zA-Z0-9_-]+$/),
	source_path: z.string().min(1).max(256),
});

const ExternalPublishInline = z
	.object({
		modrinth_mod_id: z.string().max(32).optional(),
		modrinth_pack_id: z.string().max(32).optional(),
		modrinth_version_type: z.enum(['alpha', 'beta', 'release']).optional(),
		modrinth_game_versions: z.string().max(512).optional(),
		modrinth_loaders: z.string().max(256).optional(),
		modrinth_retain_count: z.number().int().min(1).max(50).optional(),
		modrinth_rolling_version: z.string().min(1).max(64).optional(),
		modrinth_server_address: z.string().min(1).max(253).optional(),
		itch_user: z.string().min(1).max(64).optional(),
		itch_game: z.string().min(1).max(64).optional(),
		itch_channel: z.string().min(1).max(64).optional(),
		steam_apps: z.array(SteamAppInline).max(10).optional(),
		apple_bundle_id: z.string().min(1).max(128).optional(),
		apple_app_id: z.string().regex(/^\d+$/).max(16).optional(),
		apple_team_id: z.string().min(1).max(32).optional(),
		google_play_package: z.string().min(1).max(128).optional(),
		google_play_track: z
			.enum(['internal', 'alpha', 'beta', 'production'])
			.optional(),
		curseforge_project_id: z.string().regex(/^\d+$/).max(16).optional(),
		curseforge_pack_id: z.string().regex(/^\d+$/).max(16).optional(),
		curseforge_release_type: z
			.enum(['alpha', 'beta', 'release'])
			.optional(),
		factorio_mods: z.array(FactorioModInline).max(10).optional(),
	})
	.optional();

const ProjectSchemaWithEngine = ICiProjectSchema.extend({
	title: z.string().optional(),
	sidebar: z
		.object({
			label: z.string().optional(),
			order: z.number().optional(),
			hidden: z.boolean().optional(),
			badge: z.unknown().optional(),
		})
		.optional(),
	engine: z
		.object({
			version: z.string().min(1).max(64),
			project_path: z.string().min(1).max(256),
			build_targets: z.array(z.string().min(1).max(64)).max(20),
			license_method: z
				.enum(['personal', 'professional', 'serial'])
				.optional(),
			dotnet_enabled: z.boolean().optional(),
			test_args: z.array(z.string().max(256)).max(50).optional(),
			features: z.array(z.string().min(1).max(64)).max(50).optional(),
			external_repo_url: z.string().url().max(512).optional(),
		})
		.optional(),
	external_publish: ExternalPublishInline,
});

const project = defineCollection({
	loader: glob({
		pattern: '**/*.mdx',
		base: './src/content/docs/project',
	}),
	schema: ProjectSchemaWithEngine,
});

const itemdb = defineCollection({
	loader: glob({
		pattern: '**/*.mdx',
		base: './src/content/docs/itemdb',
	}),
	schema: IObjectSchema,
});

const questdb = defineCollection({
	loader: glob({
		pattern: '**/*.mdx',
		base: './src/content/docs/questdb',
	}),
	schema: IQuestSchema,
});

const mapdb = defineCollection({
	loader: glob({
		pattern: '**/*.mdx',
		base: './src/content/docs/mapdb',
	}),
	schema: IMapObjectSchema,
});

const npcdb = defineCollection({
	loader: glob({
		pattern: '**/*.mdx',
		base: './src/content/docs/npcdb',
	}),
	schema: INpcSchema,
});

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({
				itemdb: z.array(IObjectSchema).optional(),
				questdb: z.array(IQuestSchema).optional(),
				mapdb: z.array(IMapObjectSchema).optional(),
				npcdb: z.array(INpcSchema).optional(),
				osrs: OSRSFrontmatterSchema.optional(),
				mc_item: MCItemSchema.optional(),
				mc_enchant: McEnchantSchema.optional(),
				mc_block: McBlockSchema.optional(),
				'yt-tracks': z.array(z.string()).optional(),
				'yt-sets': z.array(z.string()).optional(),
				// Per-page social-meta overrides consumed by
				// src/components/navigation/Head.astro. Astro silently strips
				// nested z.object fields imported across zod-package boundaries
				// (project memory), so the SocialMetaOverlay shape is defined
				// inline here using astro:content's z instance.
				ogTitle: z.string().optional(),
				ogDescription: z.string().optional(),
				ogImage: z.string().optional(),
				twitterTitle: z.string().optional(),
				twitterDescription: z.string().optional(),
				twitterImage: z.string().optional(),
			}),
		}),
	}),
	itemdb,
	questdb,
	npcdb,
	application,
	gdd,
	project,
	mapdb,
};
