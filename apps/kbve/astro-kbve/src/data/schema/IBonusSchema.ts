import { z } from 'astro:content';
import { BonusKeys } from '../types';
import type { BonusKey } from '../types';

export const IBonusSchema = z.object(
	Object.fromEntries(
		BonusKeys.map((key) => [key, z.number().optional()]),
	) as Record<BonusKey, z.ZodOptional<z.ZodNumber>>,
);

export type BonusType = z.infer<typeof IBonusSchema>;
