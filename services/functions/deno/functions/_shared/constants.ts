/**
 * Centralized numeric constants and enumerations for edge functions.
 *
 * Single source of truth for pagination limits, container/skill enum ranges,
 * and validation bounds that were previously scattered as magic numbers across
 * individual modules.
 */

/** Request body size cap shared by every router (1 MB). */
export const MAX_BODY_BYTES = 1_048_576;

/**
 * Per-module pagination limits. Each entry is the maximum page size a caller
 * may request; requests above the max are clamped, not rejected.
 */
export const PAGINATION = {
  meme: { defaultLimit: 20, maxLimit: 50 },
  logs: { defaultLimit: 100, maxLimit: 500 },
  transfer: { defaultLimit: 50, maxLimit: 500, maxBatch: 1000 },
  discordsh: { defaultLimit: 24, maxLimit: 50, maxPage: 10000 },
  forum: { defaultLimit: 25, maxLimit: 100 },
} as const;

/** Upper bound on any page number to prevent unbounded DB offsets. */
export const MAX_PAGE = 10000;

/**
 * Minecraft container types persisted by mc/container.ts. The numeric range
 * mirrors the `mc.container_type` CHECK constraint in SQL.
 */
export enum ContainerType {
  Chest = 0,
  TrappedChest = 1,
  Barrel = 2,
  ShulkerBox = 3,
  Furnace = 4,
  BlastFurnace = 5,
  Smoker = 6,
  Dispenser = 7,
  Dropper = 8,
  Hopper = 9,
  BrewingStand = 10,
  Beacon = 11,
  EnderChest = 12,
  Other = 13,
}

export const CONTAINER_TYPE_MIN = ContainerType.Chest;
export const CONTAINER_TYPE_MAX = ContainerType.Other;

/**
 * Minecraft skill categories used by mc/skill.ts. Mirrors the
 * `mc.skill_category` enum on the server.
 */
export enum SkillCategory {
  General = 0,
  Combat = 1,
  Gathering = 2,
  Crafting = 3,
  Magic = 4,
}

export const VALID_SKILL_CATEGORIES: readonly number[] = Object.values(
  SkillCategory,
).filter((v): v is number => typeof v === "number");

/** Meme reaction type range (matches meme_reactions CHECK constraint). */
export const REACTION_MIN = 1;
export const REACTION_MAX = 6;

/** Meme report reason range (matches meme_reports CHECK constraint). */
export const REPORT_REASON_MIN = 1;
export const REPORT_REASON_MAX = 7;
