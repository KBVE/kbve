import { z, defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { pageSiteGraphSchema } from 'starlight-site-graph/schema';
import { glob } from "astro/loaders";

import type { CategoryName } from 'src/data/types';
import { ItemCategoryFlags } from 'src/data/types';

import { ICraftingSchema } from 'src/data/schema';

export const IDeployableSchema = z.object({
	size: z.tuple([z.number().int().min(1), z.number().int().min(1)]).default([1, 1]), // [width, height]
	pivot: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional().default([0.5, 0.5]),
	overridePrefab: z.string().optional(),
	scripts: z.array(z.string()).optional(),
	scaleMultiplier: z.number().positive().optional().default(1), // visual multiplier
	gridSnap: z.boolean().optional().default(true),
});

const MAX_ITEM_CATEGORY = Object.values(ItemCategoryFlags).reduce(
	(acc, val) => typeof val === 'number' ? acc | val : acc,
	0
);

const IScriptBindingSchema = z.object({
	guid: z.string().regex(/^[a-f0-9]{32}$/),
	vars: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
});

const IBonusSchema = z.object({
	armor: z.number().optional(),
	intelligence: z.number().optional(),
	health: z.number().optional(),
	mana: z.number().optional(),
	energy: z.number().optional(),
	strength: z.number().optional(),
});

export const IObjectSchema = z.object({
	id: z.string(),
	key: z.number().int().nonnegative(),
	ref: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid ULID'),
	name: z.string(),
	type: z.string(),
	category: z.number().int().nonnegative().max(MAX_ITEM_CATEGORY).optional(),
	description: z.string().optional(),
	img: z.string().optional(),
	pixelDensity: z.number().int().min(8).max(512),
	sortingLayer: z.string().optional().default('Default'),
	sortingOrder: z.number().int().optional().default(0),
	bonuses: IBonusSchema.optional(),
	durability: z.number().optional(), 
	weight: z.number().optional(),
	equipped: z.boolean().optional(),
	consumable: z.boolean().optional(),
	effects: z.string().optional(),
	stackable: z.boolean().optional(),
	rarity: z.string().optional(),
	levelRequirement: z.number().optional(),
	price: z.number().optional(),
	cooldown: z.number().optional(),
	action: z.string().optional(),
	craftingMaterials: ICraftingSchema.optional(),
	deployable: IDeployableSchema.optional(),
	credits: z.string().optional(),
	scripts: z.array(IScriptBindingSchema).optional(),
	steamMarketUrl: z.string().optional(),
	exchangeUrl: z.string().optional(),
});

export function getCategoryValue(names: CategoryName[]): number {
	let value = 0;
	for (const name of names) {
		value |= ItemCategoryFlags[name];
	}
	return value;
}


export function validateItemUniqueness(items: typeof IObjectSchema['_type'][]) {
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

const itemdb = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/docs/itemdb" }),
  schema: IObjectSchema
});


export const collections = {
	docs: defineCollection({
		schema: docsSchema({
			extend: pageSiteGraphSchema.merge(z.object({
				itemdb: z.array(IObjectSchema).optional(),
			})),
		
		}),
	}),
	itemdb: itemdb,
};