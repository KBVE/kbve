import { z } from 'astro:content';
import { ULID, GUID } from 'src/data/schema/IUtility';
import { QuestObjectiveTypeEnum, QuestCategoryEnum  } from 'src/data/schema/SchemaTypes';

export const IQuestObjectiveSchema = z.object({
	description: z.string(),
	type:   QuestObjectiveTypeEnum.default('custom'),
	targetRefs: z.array(ULID).min(1),
	requiredAmount: z.number().int().positive().default(1),
});

export const IQuestRewardSchema = z.object({
	items: z
		.array(
			z.object({
				ref: ULID,
				amount: z.number().int().positive().default(1),
			}),
		)
		.optional(),
	bonuses: z.record(z.string(), z.number()).optional(),
	steamAchievement: z.string().optional(),
	currency: z.number().optional(),
});

export const IQuestSchema = z.object({
    id: ULID,
    guid: GUID,
    title: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
    category: QuestCategoryEnum.default('main'),
    hidden: z.boolean().default(false),
	repeatable: z.boolean().default(false),
	levelRequirement: z.number().int().nonnegative().optional(),
	objectives: z.array(IQuestObjectiveSchema).nonempty(),
	rewards: IQuestRewardSchema.optional(),
	triggers: z.array(z.string()).optional(),
    nextQuestId: ULID.optional()
});
