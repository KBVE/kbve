/**
 * Astro content collection schema for icon entries.
 *
 * Proto-derived schemas come from packages/data/codegen/generated/icons-schema.ts
 * (source of truth). Astro-specific overlay fields are layered on top for MDX
 * frontmatter that doesn't belong in the proto contract.
 */
import { z } from 'astro:content';
import {
	IconSchema,
	IconCollectionSchema,
	IconRegistrySchema,
	IconViewBoxSchema,
	IconRenderSchema,
	IconLicenseInfoSchema,
	IconVariantSchema,
	IconSearchSchema,
	IconOfferingInfoSchema,
	IconExtensionSchema,
	IconStyleSchema,
	IconFormatSchema,
	IconLicenseSchema,
	IconOfferingSchema,
	IconStyles,
	IconFormats,
	IconLicenses,
	IconOfferings,
} from '../../../../../../packages/data/codegen/generated/icons-schema';

// Re-export generated schemas + const arrays for downstream consumers
export {
	IconSchema,
	IconCollectionSchema,
	IconRegistrySchema,
	IconViewBoxSchema,
	IconRenderSchema,
	IconLicenseInfoSchema,
	IconVariantSchema,
	IconSearchSchema,
	IconOfferingInfoSchema,
	IconExtensionSchema,
	IconStyleSchema,
	IconFormatSchema,
	IconLicenseSchema,
	IconOfferingSchema,
	IconStyles,
	IconFormats,
	IconLicenses,
	IconOfferings,
};

// Re-export inferred types
export type {
	Icon,
	IconCollection,
	IconRegistry,
	IconViewBox,
	IconRender,
	IconLicenseInfo,
	IconVariant,
	IconSearch,
	IconOfferingInfo,
	IconExtension,
	IconStyleValue,
	IconFormatValue,
	IconLicenseValue,
	IconOfferingValue,
} from '../../../../../../packages/data/codegen/generated/icons-schema';

// ---------------------------------------------------------------------------
// Astro MDX frontmatter schema — the proto Icon plus site-only fields.
// Consumers (content.config.ts, MDX generator) should use this, not raw
// IconSchema, so that Pagefind + UI hints live with the content.
// ---------------------------------------------------------------------------

const AstroIconOverlay = z.object({
	/** Pagefind filter tags appended at MDX generation (indexed separately). */
	pagefindFilters: z.array(z.string()).optional(),

	/** Featured flag for curated landing sections. */
	featured: z.boolean().optional(),

	/** Sort hint within a collection index page (lower = earlier). */
	order: z.number().int().optional(),

	/** Hero image path for collection cards / OG tags. */
	hero: z.string().optional(),

	/** Free-form MDX author note (surfaces on icon detail page). */
	note: z.string().optional(),
});

export const AstroIconSchema = IconSchema.and(AstroIconOverlay);
export type AstroIcon = z.infer<typeof AstroIconSchema>;

export const AstroIconCollectionSchema = IconCollectionSchema.and(
	z.object({
		hero: z.string().optional(),
		featured: z.boolean().optional(),
		order: z.number().int().optional(),
	}),
);
export type AstroIconCollection = z.infer<typeof AstroIconCollectionSchema>;
