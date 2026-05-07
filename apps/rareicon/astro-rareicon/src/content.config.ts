import { defineCollection, z } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { docsLoader } from '@astrojs/starlight/loaders';

import { IconTermOverlaySchema } from '@/data/schema';

// Per-page social meta overrides. Defined inline in content.config.ts so
// the astro:content `z` instance owns the schema (cross-package zod can
// silently strip nested fields per project memory).
const SocialMetaOverlay = z.object({
	ogTitle: z.string().optional(),
	ogDescription: z.string().optional(),
	ogImage: z.string().optional(),
	twitterTitle: z.string().optional(),
	twitterDescription: z.string().optional(),
	twitterImage: z.string().optional(),
});

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		// Extend Starlight's docsSchema with IconTerm fields so icon MDX pages
		// under src/content/docs/icons/ validate + render automatically through
		// Starlight's layout + Pagefind + sidebar. SocialMetaOverlay layers
		// per-page og: / twitter: meta hooks consumed by the Head override.
		schema: docsSchema({
			extend: IconTermOverlaySchema.and(SocialMetaOverlay),
		}),
	}),
};
