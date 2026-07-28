import { z } from 'astro/zod';
import {
	ProfessionSchema,
	ProfessionCategorySchema,
	CurveKindSchema,
} from '@kbve/proto/professiondb-schema';
import { IProfessionActionSchema } from './IProfessionActionSchema';

export { ProfessionCategorySchema, CurveKindSchema };
export type {
	Profession,
	ProfessionAction,
	ProfessionUnlock,
	ResourceAmount,
	ExperienceCurve,
	ProfessionCategoryValue,
	CurveKindValue,
} from '@kbve/proto/professiondb-schema';

export const IProfessionSchema = ProfessionSchema.extend({
	kind: z.literal('profession'),
	title: z.string().optional(),
}).passthrough();

export type IProfession = z.infer<typeof IProfessionSchema>;

export const IProfessionEntrySchema = z.discriminatedUnion('kind', [
	IProfessionSchema,
	IProfessionActionSchema,
]);

export type IProfessionEntry = z.infer<typeof IProfessionEntrySchema>;
