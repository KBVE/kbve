import { z } from 'astro:content';

export const AchievementSetByValues = ['Client', 'GS', 'OfficialGS'] as const;
export type AchievementSetBy = (typeof AchievementSetByValues)[number];
export const AchievementSetByEnum = z.enum(AchievementSetByValues);

export const STEAM_ACH_ID = z
	.string()
	.regex(
		/^[A-Z0-9_]+$/,
		'Achievement ID must be uppercase with underscores (A-Z, 0-9, _)',
	);

export const IAchievementSchema = z.object({
	id: STEAM_ACH_ID,
	name: z.string(),
	description: z.string().optional(),
	setBy: AchievementSetByEnum.default('Client'),
	iconAchieved: z.string().url(),
	iconUnachieved: z.string().url(),
});
