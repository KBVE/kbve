import { z, defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { pageSiteGraphSchema } from 'starlight-site-graph/schema';
import { glob } from "astro/loaders";

export enum ItemCategoryFlags {
	None = 0,
	Weapon = 0x00000001,
	Armor = 0x00000002,
	Tool = 0x00000004,
	Food = 0x00000008,
	Drink = 0x00000010,
	Potion = 0x00000020,
	Material = 0x00000040,
	Resource = 0x00000080,
	Skilling = 0x00000100,
	Combat = 0x00000200,
	Structure = 0x00000400,
	Magic = 0x00000800,
	Quest = 0x00001000,
	Utility = 0x00002000,
	Depletable = 0x00004000,
	Legendary = 0x00008000,
	Vehicle = 0x00010000,
	Pet = 0x00020000,
	Soul = 0x40000000,
}

const MAX_ITEM_CATEGORY = Object.values(ItemCategoryFlags).reduce(
	(acc, val) => typeof val === 'number' ? acc | val : acc,
	0
);


const IBonusSchema = z.object({
	armor: z.number().optional(),
	intelligence: z.number().optional(),
	health: z.number().optional(),
	mana: z.number().optional(),
});

const IObjectSchema = z.object({
	id: z.string(),
	key: z.number().int().nonnegative(),
	ref: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid ULID'),
	name: z.string(),
	type: z.string(),
	category: z.number().int().nonnegative().max(MAX_ITEM_CATEGORY).optional(),
	description: z.string().optional(),
	img: z.string().optional(),
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
	craftingMaterials: z.array(z.string()).optional(),
	credits: z.string().optional(),
});

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