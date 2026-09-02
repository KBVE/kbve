/**
 * Shared pagination validation.
 *
 * Replaces the per-module limit/cursor/offset/page clamping repeated across
 * meme, mc, discordsh, forum. Two styles are supported:
 *   - validateLimit(): strict integer validation, returns an error Response on
 *     out-of-range input (used by meme, which rejects bad input).
 *   - clampLimit()/clampPage()/clampOffset(): silent clamping, used by modules
 *     that prefer to coerce rather than reject (mc, discordsh).
 */

import { jsonResponse } from "./supabase.ts";
import { MAX_PAGE } from "./constants.ts";

export interface LimitResult {
  value: number;
  error: Response | null;
}

/**
 * Strict pagination limit: must be an integer in [1, max].
 * Returns the default when the value is omitted, an error Response otherwise.
 */
export function validateLimit(
  limit: unknown,
  { def = 20, max = 50 }: { def?: number; max?: number } = {},
): LimitResult {
  if (limit === undefined || limit === null) {
    return { value: def, error: null };
  }
  const num = Number(limit);
  if (!Number.isInteger(num) || num < 1 || num > max) {
    return {
      value: def,
      error: jsonResponse(
        { error: `limit must be an integer between 1 and ${max}` },
        400,
      ),
    };
  }
  return { value: num, error: null };
}

/** Silently clamp a limit into [1, max], falling back to `def`. */
export function clampLimit(
  limit: unknown,
  { def, max }: { def: number; max: number },
): number {
  return Math.min(Math.max(Number(limit) || def, 1), max);
}

/** Silently clamp a 1-based page into [1, maxPage]. */
export function clampPage(page: unknown, maxPage: number = MAX_PAGE): number {
  return Math.min(Math.max(Number(page) || 1, 1), maxPage);
}

/** Silently clamp a non-negative offset, capped to avoid unbounded scans. */
export function clampOffset(
  offset: unknown,
  maxOffset = MAX_PAGE * 1000,
): number {
  return Math.min(Math.max(Number(offset) || 0, 0), maxOffset);
}
