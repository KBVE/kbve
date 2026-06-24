/**
 * Astro content collection schema for spelldb entries.
 *
 * Game-logic fields come from the proto-generated SpellSchema
 * (packages/data/codegen/generated/spelldb-schema.ts).
 */
import { z } from 'astro/zod';
import {
	SpellSchema,
	SpellSchoolSchema,
	SpellTargetSchema,
	SpellEffectSchema,
	SpellRaritySchema,
} from '@kbve/proto/spelldb-schema';

export {
	SpellSchoolSchema,
	SpellTargetSchema,
	SpellEffectSchema,
	SpellRaritySchema,
};
export type {
	Spell,
	SpellSchoolValue,
	SpellTargetValue,
	SpellEffectValue,
	SpellRarityValue,
} from '@kbve/proto/spelldb-schema';

export const ISpellSchema = SpellSchema.passthrough();

export type ISpell = z.infer<typeof ISpellSchema>;
