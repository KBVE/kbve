import { z } from 'astro:content';

//  [Quest -> Objective Types]
export const QuestObjectiveTypes = ['collect', 'kill', 'visit', 'interact', 'custom'] as const;
export type QuestObjectiveType = typeof QuestObjectiveTypes[number];
export const QuestObjectiveTypeEnum = z.enum(QuestObjectiveTypes);


//  [Quest -> Categories]
export const QuestCategories = ['main', 'side', 'daily', 'event', 'challenge'] as const;
export type QuestCategory = typeof QuestCategories[number];
export const QuestCategoryEnum = z.enum(QuestCategories);

