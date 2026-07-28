import { z } from 'astro/zod';
import { ProfessionActionSchema } from '@kbve/proto/professiondb-schema';

export const IProfessionActionSchema = ProfessionActionSchema.extend({
	kind: z.literal('action'),
	profession: z.string(),
	title: z.string().optional(),
	drafted: z.boolean().optional(),
}).passthrough();

export type IProfessionAction = z.infer<typeof IProfessionActionSchema>;
