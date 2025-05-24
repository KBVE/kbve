import { z, defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { pageSiteGraphSchema } from 'starlight-site-graph/schema';

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
	Soul = 0x80000000,
}


const IBonusSchema = z.object({
	armor: z.number().optional(),
	intelligence: z.number().optional(),
	health: z.number().optional(),
	mana: z.number().optional(),
});

const IObjectSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.string(),
	category: z.string().optional(),
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

export const collections = {
	docs: defineCollection({
		schema: docsSchema({
			extend: pageSiteGraphSchema
			// itemdb: z.array(IObjectSchema).optional(),
		}),
	}),
};
