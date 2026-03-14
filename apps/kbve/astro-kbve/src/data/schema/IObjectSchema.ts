/**
 * Astro content collection schema for itemdb entries.
 *
 * Game-logic fields come from the proto-generated ItemSchema
 * (packages/data/codegen/generated/itemdb-schema.ts).
 * Astro-specific fields are layered on top.
 */
import { z } from 'astro:content';
import {
	ItemSchema,
	ItemBonusesSchema,
	ScriptBindingSchema,
	DeployableInfoSchema,
	CraftingRecipeSchema,
	ItemRaritySchema,
} from '../../../../../../packages/data/codegen/generated/itemdb-schema';

// Re-export generated types for downstream consumers
export {
	ItemRaritySchema,
	ItemBonusesSchema,
	ScriptBindingSchema,
	DeployableInfoSchema,
	CraftingRecipeSchema,
};
export type {
	Item,
	ItemBonuses,
	ScriptBinding,
	DeployableInfo,
	CraftingRecipe,
	ItemRarityValue,
	ItemTypeFlagValue,
} from '../../../../../../packages/data/codegen/generated/itemdb-schema';

// ---------------------------------------------------------------------------
// Astro-specific script binding override
// Proto vars are string-only; MDX YAML naturally produces numbers/booleans
// ---------------------------------------------------------------------------

const AstroScriptBindingSchema = z.object({
	guid: z.string().regex(/^[a-f0-9]{32}$/),
	name: z.string().optional(),
	vars: z
		.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
		.optional(),
});

// ---------------------------------------------------------------------------
// Astro-specific fields — not part of the proto contract
// ---------------------------------------------------------------------------

const AstroItemExtensions = z.object({
	key: z.number().int().nonnegative(),
	effects: z.string().optional(),
	equipped: z.boolean().optional(),
	steam_market_url: z.string().optional(),
	exchange_url: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Combined schema — proto source of truth + Astro extensions
// Override scripts to allow number/boolean vars in MDX YAML
// ---------------------------------------------------------------------------

export const IObjectSchema = ItemSchema.omit({ scripts: true })
	.merge(AstroItemExtensions)
	.extend({
		scripts: z.array(AstroScriptBindingSchema).optional(),
	})
	.passthrough();

export type IObject = z.infer<typeof IObjectSchema>;
