/**
 * Astro content collection schema for questdb entries.
 *
 * Game-logic fields come from the proto-generated QuestSchema
 * (packages/data/codegen/generated/questdb-schema.ts).
 */
import { z } from 'astro:content';
import {
	QuestSchema,
	QuestCategorySchema,
	ObjectiveTypeSchema,
	QuestObjectiveSchema,
	QuestRewardsSchema,
	AchievementMetaSchema,
} from '../../../../../../packages/data/codegen/generated/questdb-schema';

// Re-export generated types for downstream consumers
export {
	QuestCategorySchema,
	ObjectiveTypeSchema,
	QuestObjectiveSchema,
	QuestRewardsSchema,
	AchievementMetaSchema,
};
export type {
	Quest,
	QuestCategoryValue,
	ObjectiveTypeValue,
	QuestObjective,
	QuestRewards,
	AchievementMeta,
} from '../../../../../../packages/data/codegen/generated/questdb-schema';

// ---------------------------------------------------------------------------
// Astro extensions — fields not in the proto Quest message but used in MDX
// ---------------------------------------------------------------------------

// The proto Quest message uses `steps` (containing objectives) for structured
// quest progression.  Astro MDX files may use a flat top-level `objectives`
// array for simpler quests that don't need the full step system.
const AstroQuestExtensions = z.object({
	objectives: z.array(QuestObjectiveSchema).optional(),
});

// ---------------------------------------------------------------------------
// Combined schema — proto source of truth, merged with Astro extras
// ---------------------------------------------------------------------------

export const IQuestSchema =
	QuestSchema.merge(AstroQuestExtensions).passthrough();

export type IQuest = z.infer<typeof IQuestSchema>;
