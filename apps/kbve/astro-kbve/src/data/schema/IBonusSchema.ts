import { z } from 'astro:content';

export const IBonusSchema = z.object({
	armor: z.number().optional(),
	intelligence: z.number().optional(),
	health: z.number().optional(),
	mana: z.number().optional(),
	energy: z.number().optional(),
	strength: z.number().optional(),
});
