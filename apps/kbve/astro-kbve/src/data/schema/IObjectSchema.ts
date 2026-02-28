import { z } from 'astro:content';

import { ItemCategoryFlags } from '@/data/types';
import { ICraftingSchema } from '@/data/schema/ICraftingSchema';
import { IBonusSchema } from '@/data/schema/IBonusSchema';
import { IDeployableSchema } from '@/data/schema/IDeployableSchema';
import { IScriptBindingSchema } from '@/data/schema/IScriptBindingSchema';

const MAX_ITEM_CATEGORY = Object.values(ItemCategoryFlags).reduce(
	(acc, val) => (typeof val === 'number' ? acc | val : acc),
	0,
);

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
