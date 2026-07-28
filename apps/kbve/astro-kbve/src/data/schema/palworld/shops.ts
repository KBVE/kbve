import { z } from 'astro/zod';

export const PalShopProductTypeSchema = z.enum(['Normal']);

export const PalShopItemSchema = z.object({
	id: z.string().min(1),
	type: PalShopProductTypeSchema.default('Normal'),
	price: z.number().int().nonnegative().default(0),
	num: z.number().int().positive().default(1),
	stock: z.number().int().nonnegative().default(0),
});
export type PalShopItem = z.infer<typeof PalShopItemSchema>;

export const PalShopSchema = z.object({
	shopId: z.string().min(1),
	action: z.enum(['Clear']).default('Clear'),
	items: z.array(PalShopItemSchema).min(1),
});
export type PalShop = z.infer<typeof PalShopSchema>;
