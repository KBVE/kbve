/**
 * Astro content collection schema for npcdb entries.
 *
 * Game-logic fields come from the proto-generated NpcSchema
 * (packages/data/codegen/generated/npcdb-schema.ts).
 */
import { z } from 'astro:content';
import {
	NpcSchema,
	NpcTypeFlagSchema,
	NpcRaritySchema,
	NpcRankSchema,
	PersonalitySchema,
	ElementSchema,
	CreatureFamilySchema,
	NpcStatsSchema,
	NpcAbilitySchema,
	ElementalAffinitySchema,
	IntentWeightSchema,
	BehaviorTraitsSchema,
	FactionInfoSchema,
	LootTableSchema,
	EquipmentLoadoutSchema,
	FlavorPoolSchema,
	DialogueLineSchema,
	DialogueTreeSchema,
	SpawnRuleSchema,
	PhaseRuleSchema,
	DifficultyOverrideSchema,
	PartyScalingSchema,
	SpatialPropertiesSchema,
	InteractionFlagsSchema,
	NpcExtensionSchema,
} from '../../../../../../packages/data/codegen/generated/npcdb-schema';

// Re-export generated types for downstream consumers
export {
	NpcTypeFlagSchema,
	NpcRaritySchema,
	NpcRankSchema,
	PersonalitySchema,
	ElementSchema,
	CreatureFamilySchema,
	NpcStatsSchema,
	NpcAbilitySchema,
	ElementalAffinitySchema,
	IntentWeightSchema,
	BehaviorTraitsSchema,
	FactionInfoSchema,
	LootTableSchema,
	EquipmentLoadoutSchema,
	FlavorPoolSchema,
	DialogueLineSchema,
	DialogueTreeSchema,
	SpawnRuleSchema,
	PhaseRuleSchema,
	DifficultyOverrideSchema,
	PartyScalingSchema,
	SpatialPropertiesSchema,
	InteractionFlagsSchema,
	NpcExtensionSchema,
};
export type {
	Npc,
	NpcTypeFlag,
	NpcRarityValue,
	NpcRankValue,
	PersonalityValue,
	ElementValue,
	CreatureFamilyValue,
	NpcStats,
	NpcAbility,
	ElementalAffinity,
	IntentWeight,
	BehaviorTraits,
	FactionInfo,
	LootTable,
	EquipmentLoadout,
	FlavorPool,
	DialogueLine,
	DialogueTree,
	SpawnRule,
	PhaseRule,
	DifficultyOverride,
	PartyScaling,
	SpatialProperties,
	InteractionFlags,
	NpcExtension,
} from '../../../../../../packages/data/codegen/generated/npcdb-schema';

// ---------------------------------------------------------------------------
// Combined schema — proto source of truth, merged with Astro extras
// ---------------------------------------------------------------------------

export const INpcSchema = NpcSchema.passthrough();

export type INpc = z.infer<typeof INpcSchema>;
