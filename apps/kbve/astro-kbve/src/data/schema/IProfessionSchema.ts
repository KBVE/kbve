/**
 * Astro content collection schema for professiondb entries.
 *
 * Game-logic fields come from the proto-generated ProfessionSchema
 * (packages/data/codegen/generated/professiondb-schema.ts).
 */
import { z } from 'astro/zod';
import {
	ProfessionSchema,
	ProfessionCategorySchema,
	CurveKindSchema,
} from '@kbve/proto/professiondb-schema';

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

export const IProfessionSchema = ProfessionSchema.passthrough();

export type IProfession = z.infer<typeof IProfessionSchema>;
