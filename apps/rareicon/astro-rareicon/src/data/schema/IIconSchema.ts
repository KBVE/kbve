/**
 * Astro content collection schema for icon terms.
 *
 * Proto-derived schemas come from packages/data/codegen/generated/icons-schema.ts
 * (source of truth). Each MDX page = one IconTerm; the term holds every visual
 * variant (Icon) of the concept, so Pagefind indexes term pages and all
 * variants of "sword" live on one URL.
 */
import { z } from 'zod';
import {
	IconSchema,
	IconTermSchema,
	IconCollectionSchema,
	IconRegistrySchema,
	IconViewBoxSchema,
	IconRenderSchema,
	IconLicenseInfoSchema,
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
	IconTermSchema,
	IconCollectionSchema,
	IconRegistrySchema,
	IconViewBoxSchema,
	IconRenderSchema,
	IconLicenseInfoSchema,
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
	IconTerm,
	IconCollection,
	IconRegistry,
	IconViewBox,
	IconRender,
	IconLicenseInfo,
	IconSearch,
	IconOfferingInfo,
	IconExtension,
	IconStyleValue,
	IconFormatValue,
	IconLicenseValue,
	IconOfferingValue,
} from '../../../../../../packages/data/codegen/generated/icons-schema';

// ---------------------------------------------------------------------------
// Astro MDX frontmatter schema — one term per MDX. Proto IconTerm + site-only
// overlay fields.
// ---------------------------------------------------------------------------

const AstroOverlayFields = z.object({
	/** Pagefind filter tags indexed separately. */
	pagefindFilters: z.array(z.string()).optional(),

	/** Featured flag for curated landing sections. */
	featured: z.boolean().optional(),

	/** Sort hint within a category index page (lower = earlier). */
	order: z.number().int().optional(),

	/** Hero image path for category cards / OG tags. */
	hero: z.string().optional(),

	/** Free-form MDX author note (surfaces on the term detail page). */
	note: z.string().optional(),
});

// Strict term schema used when you hold a full IconTerm in hand (non-MDX code).
export const AstroIconTermSchema = IconTermSchema.and(AstroOverlayFields);
export type AstroIconTerm = z.infer<typeof AstroIconTermSchema>;

// ---------------------------------------------------------------------------
// Starlight `docs` collection extension — every field optional so non-icon
// docs pages (guides, game, auth) pass validation. Icon MDX pages under
// src/content/docs/icons/ supply the icon-specific fields.
// ---------------------------------------------------------------------------
export const IconTermOverlaySchema = z.object({
	id: z.string().optional(),
	ref: z.string().optional(),
	name: z.string().optional(),
	primary_category: z.string().optional(),
	categories: z.array(z.string()).optional(),
	tags: z.array(z.string()).optional(),
	related_term_refs: z.array(z.string()).optional(),
	search: IconSearchSchema.optional(),
	default_license: IconLicenseInfoSchema.optional(),
	default_offering: IconOfferingInfoSchema.optional(),
	icons: z.array(IconSchema).optional(),
	credits: z.string().optional(),
	version: z.string().optional(),
	drafted: z.boolean().optional(),

	// Astro overlay fields — all optional. `hero` intentionally omitted here
	// since Starlight's docsSchema owns `hero` for splash pages (object shape).
	pagefindFilters: z.array(z.string()).optional(),
	featured: z.boolean().optional(),
	order: z.number().int().optional(),
	note: z.string().optional(),
});

export const AstroIconCollectionSchema = IconCollectionSchema.and(
	z.object({
		hero: z.string().optional(),
		featured: z.boolean().optional(),
		order: z.number().int().optional(),
	}),
);
export type AstroIconCollection = z.infer<typeof AstroIconCollectionSchema>;
