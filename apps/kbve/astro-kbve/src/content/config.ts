import { z, defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { pageSiteGraphSchema } from 'starlight-site-graph/schema';

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
			// itemdb: z.array(IObjectSchema).optional(),
		}),
	}),
};
