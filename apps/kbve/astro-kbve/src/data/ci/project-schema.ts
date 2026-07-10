import { z } from 'astro/zod';
import { ICiProjectSchema } from '@/data/schema';

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

export const ProjectSchemaWithEngine = ICiProjectSchema.extend({
	title: z.string().optional(),
	tags: z.array(z.string()).optional(),
	featured: z.boolean().optional(),
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
			external_repo_ref: z.string().min(1).max(128).optional(),
			server_target: z.string().min(1).max(128).optional(),
			server_config: z
				.enum(['Development', 'Shipping', 'Test', 'DebugGame', 'Debug'])
				.optional(),
			client_config: z
				.enum(['Development', 'Shipping', 'Test', 'DebugGame', 'Debug'])
				.optional(),
			maps: z.array(z.string().min(1).max(128)).max(50).optional(),
			game_mode: z.string().min(1).max(256).optional(),
			custom_config: z.string().min(1).max(128).optional(),
			use_logging_in_shipping: z.enum(['0', '1']).optional(),
		})
		.optional(),
	external_publish: ExternalPublishInline,
	verticals: z
		.array(
			z.object({
				slug: z
					.string()
					.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
					.max(50),
				label: z.string().min(1).max(100),
				description: z.string().max(500).optional(),
				status: z
					.enum(['inactive', 'active', 'featured'])
					.default('active'),
				sort_order: z.number().int().nonnegative().default(0),
				disciplines: z
					.array(z.tuple([z.string(), z.string()]))
					.optional(),
				tools: z.array(z.tuple([z.string(), z.string()])).optional(),
				skills: z.array(z.tuple([z.string(), z.string()])).optional(),
			}),
		)
		.optional(),
});
