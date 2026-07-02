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
	ISpellSchema,
	ITileSchema,
	OSRSExtendedSchema,
	ICiProjectSchema,
	MCItemSchema,
	McEnchantSchema,
	McBlockSchema,
	MCSchematicFrontmatterSchema,
	MCLotFrontmatterSchema,
	MCPoiFrontmatterSchema,
} from '@/data/schema';
import { ProjectSchemaWithEngine } from '@/data/ci/project-schema';

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

const spelldb = defineCollection({
	loader: glob({
		pattern: '**/*.mdx',
		base: './src/content/docs/spelldb',
	}),
	schema: ISpellSchema,
});

const tiledb = defineCollection({
	loader: glob({
		pattern: '**/*.mdx',
		base: './src/content/docs/tiledb',
	}),
	schema: ITileSchema,
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
				mc_schematic: MCSchematicFrontmatterSchema.optional(),
				mc_lot: MCLotFrontmatterSchema.optional(),
				mc_poi: MCPoiFrontmatterSchema.optional(),
				'yt-tracks': z.array(z.string()).optional(),
				'yt-sets': z.array(z.string()).optional(),
				// Journal post metadata consumed by the RSS feed
				// (src/pages/rss.xml.ts). Without these the docs schema strips
				// them from entry.data.
				date: z.coerce.date().optional(),
				img: z.string().optional(),
				category: z.string().optional(),
				tags: z.array(z.string()).optional(),
				sem: z.number().int().optional(),
				// Project-page software metadata consumed by Head.astro to
				// derive SoftwareSourceCode JSON-LD. Without these the docs
				// schema strips them from entry.data and no node is emitted.
				source_path: z.string().optional(),
				app_name: z.string().optional(),
				version: z.string().optional(),
				license: z.string().optional(),
				author: z.string().optional(),
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
				noindex: z.boolean().optional(),
				jsonld: z
					.object({
						disable: z.boolean().optional(),
						type: z.enum(['WebPage', 'Article']).optional(),
						image: z.string().optional(),
						datePublished: z.string().optional(),
						dateModified: z.string().optional(),
						author: z.string().optional(),
						section: z.string().optional(),
						keywords: z.array(z.string()).optional(),
						breadcrumb: z
							.array(
								z.object({
									name: z.string(),
									path: z.string(),
								}),
							)
							.optional(),
						faq: z
							.array(
								z.object({
									question: z.string(),
									answer: z.string(),
								}),
							)
							.optional(),
					})
					.optional(),
			}),
		}),
	}),
	itemdb,
	questdb,
	npcdb,
	spelldb,
	application,
	gdd,
	project,
	mapdb,
	tiledb,
};
