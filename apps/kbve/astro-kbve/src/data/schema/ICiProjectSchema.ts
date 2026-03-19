/**
 * Astro content collection schema for project entries.
 *
 * CI dispatch fields come from the proto-generated CiProjectSchema
 * (packages/data/codegen/generated/ci_registry-schema.ts).
 * Astro/Starlight-specific fields are layered on top.
 */
import { z } from 'astro:content';
import {
	CiProjectSchema,
	DispatchPipelineSchema,
	DispatchPipelines,
} from '../../../../../../packages/data/codegen/generated/ci_registry-schema';

// Re-export generated types for downstream consumers
export { DispatchPipelineSchema, DispatchPipelines };
export type {
	CiProject,
	DispatchPipelineValue,
} from '../../../../../../packages/data/codegen/generated/ci_registry-schema';

// ---------------------------------------------------------------------------
// Astro-specific fields — not part of the proto contract
// ---------------------------------------------------------------------------

const AstroProjectExtensions = z.object({
	unsplash: z.string().optional(),
	img: z.string().url().optional(),
});

// ---------------------------------------------------------------------------
// Combined schema — proto source of truth + Astro extensions
// All proto CI fields are optional in MDX frontmatter so that
// documentation-only pages (e.g. pirate, rareicon) don't need them.
// ---------------------------------------------------------------------------

export const ICiProjectSchema = AstroProjectExtensions.extend({
	key: CiProjectSchema.shape.key.optional(),
	pipeline: DispatchPipelineSchema.optional(),
	app_name: CiProjectSchema.shape.app_name,
	package_name: CiProjectSchema.shape.package_name,
	pypi_name: CiProjectSchema.shape.pypi_name,
	plugin_name: CiProjectSchema.shape.plugin_name,
	plugin_path: CiProjectSchema.shape.plugin_path,
	dependency_plugins: CiProjectSchema.shape.dependency_plugins,
	itch_game_id: CiProjectSchema.shape.itch_game_id,
	source_path: CiProjectSchema.shape.source_path,
	version_toml: CiProjectSchema.shape.version_toml,
});

export type ICiProject = z.infer<typeof ICiProjectSchema>;
