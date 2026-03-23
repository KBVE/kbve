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
	TestFrameworkSchema,
	TestFrameworks,
} from '../../../../../../packages/data/codegen/generated/ci_registry-schema';

// Re-export generated types for downstream consumers
export {
	DispatchPipelineSchema,
	DispatchPipelines,
	TestFrameworkSchema,
	TestFrameworks,
};
export type {
	CiProject,
	DispatchPipelineValue,
	TestFrameworkValue,
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
	version: CiProjectSchema.shape.version,
	author: CiProjectSchema.shape.author,
	license: CiProjectSchema.shape.license,
	repository_url: CiProjectSchema.shape.repository_url,
	homepage_url: CiProjectSchema.shape.homepage_url,
	status: CiProjectSchema.shape.status,
	min_engine_version: CiProjectSchema.shape.min_engine_version,
	supported_platforms: CiProjectSchema.shape.supported_platforms,
	runner: CiProjectSchema.shape.runner,
	image: CiProjectSchema.shape.image,
	e2e_name: CiProjectSchema.shape.e2e_name,
	deployment_yaml: CiProjectSchema.shape.deployment_yaml,
	version_target: CiProjectSchema.shape.version_target,
	has_test: CiProjectSchema.shape.has_test,
	target: CiProjectSchema.shape.target,
	nx_project: CiProjectSchema.shape.nx_project,
	test_framework: TestFrameworkSchema.optional(),
});

export type ICiProject = z.infer<typeof ICiProjectSchema>;
