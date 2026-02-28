import { z } from 'astro:content';
import {
	QuestObjectiveTypeEnum,
	QuestCategoryEnum,
	ULID,
	GUID,
} from '@/data/types';

export const IAchievementMetaSchema = z.object({
	apiName: z.string(),
	name: z.string().optional(),
	description: z.string().optional(),
	iconAchieved: z.string().optional(),
	iconUnachieved: z.string().optional(),
	globalPercent: z.number().min(0).max(100).optional(),
	hidden: z.boolean().optional().default(false),
	minValue: z.number().optional(),
	maxValue: z.number().optional(),
});

export const IQuestObjectiveSchema = z.object({
	description: z.string(),
	type: QuestObjectiveTypeEnum.default('custom'),
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
	steamAchievement: IAchievementMetaSchema.optional(),
	currency: z.number().optional(),
});

export const IQuestSchema = z
	.object({
		id: ULID,
		guid: GUID,
		drafted: z.boolean().optional().default(false),
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
		nextQuestId: ULID.optional().nullable(),
	})
	.passthrough();
